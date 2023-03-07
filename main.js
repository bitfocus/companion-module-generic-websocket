const { InstanceBase, runEntrypoint, Regex, InstanceStatus } = require('@companion-module/base')
const WebSocket = require('ws')
const objectPath = require('object-path')

class WebsocketInstance extends InstanceBase {
	isInitialized = false

	subscriptions = new Map()

	async init(config) {
		this.config = config

		this.initWebSocket()
		this.isInitialized = true

		this.updateVariables()
		this.initActions()
		this.initFeedbacks()
		this.subscribeFeedbacks()
	}

	async destroy() {
		this.isInitialized = false
		if (this.reconnect_timer) {
			clearTimeout(this.reconnect_timer)
			this.reconnect_timer = null
		}
		if (this.ws) {
			this.ws.close(1000)
			delete this.ws
		}
	}

	async configUpdated(config) {
		this.config = config
		this.initWebSocket()
	}

	updateVariables(callerId = null) {
		let variables = new Set()
		let defaultValues = {}
		this.subscriptions.forEach((subscription, subscriptionId) => {
			if (!subscription.variableName.match(/^[-a-zA-Z0-9_]+$/)) {
				return
			}
			variables.add(subscription.variableName)
			if (callerId === null || callerId === subscriptionId) {
				defaultValues[subscription.variableName] = ''
			}
		})
		let variableDefinitions = []
		variables.forEach((variable) => {
			variableDefinitions.push({
				name: variable,
				variableId: variable,
			})
		})
		this.setVariableDefinitions(variableDefinitions)
		if (this.config.reset_variables) {
			this.setVariableValues(defaultValues)
		}
	}

	maybeReconnect() {
		if (this.isInitialized && this.config.reconnect) {
			if (this.reconnect_timer) {
				clearTimeout(this.reconnect_timer)
			}
			this.reconnect_timer = setTimeout(() => {
				this.initWebSocket()
			}, 5000)
		}
	}

	initWebSocket() {
		if (this.reconnect_timer) {
			clearTimeout(this.reconnect_timer)
			this.reconnect_timer = null
		}

		const ip = this.config.host
		const port = this.config.port
		if (!ip || !port) {
			this.updateStatus(InstanceStatus.BadConfig, `no host and/or port defined`)
			return
		}

		this.updateStatus(InstanceStatus.Connecting)

		if (this.ws) {
			this.ws.close(1000)
			delete this.ws
		}
		this.ws = new WebSocket(`ws://${ip}:${port}`)

		this.ws.on('open', () => {
			this.updateStatus(InstanceStatus.Ok)
			this.log('debug', `Connection opened`)
			if (this.config.reset_variables) {
				this.updateVariables()
			}
		})
		this.ws.on('close', (code) => {
			this.log('debug', `Connection closed with code ${code}`)
			this.updateStatus(InstanceStatus.Disconnected, `Connection closed with code ${code}`)
			this.maybeReconnect()
		})

		this.ws.on('message', this.messageReceivedFromWebSocket.bind(this))

		this.ws.on('error', (data) => {
			this.log('error', `WebSocket error: ${data}`)
		})
	}

	messageReceivedFromWebSocket(data) {
		if (this.config.debug_messages) {
			this.log('debug', `Message received: ${data}`)
		}

		let msgValue = null
		try {
			msgValue = JSON.parse(data)
		} catch (e) {
			msgValue = data
		}

		this.subscriptions.forEach((subscription) => {
			if (subscription.variableName === '') {
				return
			}
			if (subscription.subpath === '') {
				this.setVariableValues({
					[subscription.variableName]: typeof msgValue === 'object' ? JSON.stringify(msgValue) : msgValue,
				})
			} else if (typeof msgValue === 'object' && objectPath.has(msgValue, subscription.subpath)) {
				let value = objectPath.get(msgValue, subscription.subpath)
				this.setVariable({
					[subscription.variableName]: typeof value === 'object' ? JSON.stringify(value) : value,
				})
			}
		})
	}

	getConfigFields() {
		return [
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: 'Information',
				value:
					"<strong>PLEASE READ THIS!</strong> Generic modules is only for use with custom applications. If you use this module to control a device or software on the market that more than you are using, <strong>PLEASE let us know</strong> about this software, so we can make a proper module for it. If we already support this and you use this to trigger a feature our module doesn't support, please let us know. We want companion to be as easy as possible to use for anyone.",
			},
			{
				type: 'textinput',
				id: 'host',
				label: 'Target host',
				tooltip: 'The host of the WebSocket server',
				width: 6,
			},
			{
				type: 'textinput',
				id: 'port',
				label: 'Port',
				tooltip: 'The port of the WebSocket server',
				width: 6,
				regex: Regex.NUMBER,
			},
			{
				type: 'checkbox',
				id: 'reconnect',
				label: 'Reconnect',
				tooltip: 'Reconnect on WebSocket error (after 5 secs)',
				width: 6,
				default: true,
			},
			{
				type: 'checkbox',
				id: 'debug_messages',
				label: 'Debug messages',
				tooltip: 'Log incomming and outcomming messages',
				width: 6,
			},
			{
				type: 'checkbox',
				id: 'reset_variables',
				label: 'Reset variables',
				tooltip: 'Reset variables on init and on connect',
				width: 6,
				default: true,
			},
		]
	}

	initFeedbacks() {
		this.setFeedbackDefinitions({
			websocket_variable: {
				type: 'advanced',
				name: 'Update variable with value from WebSocket message',
				description:
					'Receive messages from the WebSocket and set the value to a variable. Variables can be used on any button.',
				options: [
					{
						type: 'textinput',
						label: 'JSON Path (blank if not json)',
						id: 'subpath',
						default: '',
					},
					{
						type: 'textinput',
						label: 'Variable',
						id: 'variable',
						regex: '/^[-a-zA-Z0-9_]+$/',
						default: '',
					},
				],
				callback: () => {
					// Nothing to do, as this feeds a variable
					return {}
				},
				subscribe: (feedback) => {
					this.subscriptions.set(feedback.id, {
						variableName: feedback.options.variable,
						subpath: feedback.options.subpath,
					})
					if (this.isInitialized) {
						this.updateVariables(feedback.id)
					}
				},
				unsubscribe: (feedback) => {
					this.subscriptions.delete(feedback.id)
				},
			},
		})
	}

	initActions() {
		this.setActionDefinitions({
			send_command: {
				name: 'Send generic command',
				options: [
					{
						type: 'textinput',
						label: 'data',
						id: 'data',
						default: '',
						useVariables: true,
					},
				],
				callback: async (action, context) => {
					const value = await context.parseVariablesInString(action.options.data)
					if (this.config.debug_messages) {
						this.log('debug', `Message sent: ${value}`)
					}
					this.ws.send(value + '\r\n')
				},
			},
		})
	}
}

runEntrypoint(WebsocketInstance, [])
