import { InstanceBase, runEntrypoint, InstanceStatus } from '@companion-module/base'
import WebSocket from 'ws'
import objectPath from 'object-path'
import { upgradeScripts } from './upgrade.js'

class WebsocketInstance extends InstanceBase {
    isInitialized = false
    subscriptions = new Map()
    wsRegex = '^wss?:\\/\\/([\\da-z\\.-]+)(:\\d{1,5})?(?:\\/(.*))?$'

    async init(config) {
        this.config = config
        if (!this.config.fbprefix) this.config.fbprefix = ''
        if (!this.config.fbsuffix) this.config.fbsuffix = ''

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
        if (this.ping_timer) {
            clearInterval(this.ping_timer)
            this.ping_timer = null
        }
        if (this.ws) {
            this.ws.close(1000)
            delete this.ws
        }
    }

    async configUpdated(config) {
        const oldconfig = { ...this.config }
        this.config = config
        
        if (!this.config.fbprefix) this.config.fbprefix = ''
        if (!this.config.fbsuffix) this.config.fbsuffix = ''

        if (
            oldconfig['ping_enabled'] !== config['ping_enabled'] ||
            oldconfig['ping_interval'] !== config['ping_interval'] ||
            oldconfig['ping_hex'] !== config['ping_hex']
        ) {
            if (this.ping_timer) {
                clearInterval(this.ping_timer)
                this.ping_timer = null
            }

            if (this.config.ping_enabled && this.ws?.readyState === WebSocket.OPEN) {
                this.ping_timer = setInterval(() => {
                    if (this.ws?.readyState === WebSocket.OPEN) {
                        this.ws.send(this.hexToBuffer(this.config.ping_hex || '00'), (err) => {
                            if (err) this.log('error', `Ping send failed: ${err.message}`)
                        })
                        if (this.config.debug_messages) {
                            this.log('debug', `Ping sent: ${this.config.ping_hex || '00'}`)
                        }
                    }
                }, this.config.ping_interval || 3000)
            }
        }

        if (oldconfig['url'] !== config['url']) this.initWebSocket()
    }

    hexToBuffer(hexString) {
        return Buffer.from(hexString.replace(/[^0-9a-fA-F]/g, ''), 'hex')
    }

    updateVariables(callerId = null) {
        let variables = new Set()
        let defaultValues = {}
        this.subscriptions.forEach((subscription, subscriptionId) => {
            if (!subscription.variableName.match(/^[-a-zA-Z0-9_]+$/)) return
            variables.add(subscription.variableName)
            if (callerId === null || callerId === subscriptionId) {
                defaultValues[subscription.variableName] = ''
            }
        })
        let variableDefinitions = [{ name: 'Timestamp when last data was received', variableId: 'lastDataReceived' }]
        variables.forEach((variable) => {
            variableDefinitions.push({ name: variable, variableId: variable })
        })
        this.setVariableDefinitions(variableDefinitions)
        if (this.config.reset_variables) {
            this.setVariableValues(defaultValues)
        }
    }

    maybeReconnect() {
        if (this.isInitialized && this.config.reconnect) {
            if (this.reconnect_timer) clearTimeout(this.reconnect_timer)
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
        if (this.ping_timer) {
            clearInterval(this.ping_timer)
            this.ping_timer = null
        }

        const url = this.config.url
        if (!url || url.match(new RegExp(this.wsRegex)) === null) {
            this.updateStatus(InstanceStatus.BadConfig, `WS URL is not defined or invalid`)
            return
        }

        this.updateStatus(InstanceStatus.Connecting)

        if (this.ws) {
            this.ws.close(1000)
            delete this.ws
        }

        const userAgents = {
            chrome: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/122.0.0.0 Safari/537.36',
            firefox: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64; rv:124.0) Gecko/20100101 Firefox/124.0',
            safari: 'Mozilla/5.0 (Macintosh; Intel Mac OS X 14_4) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.4 Safari/605.1.15',
            custom: this.config.user_agent_custom || '',
        }

        const selectedUA = userAgents[this.config.user_agent]
        
        // [H2 FIX] Lógica de Origin dinâmica para suportar WSS (https)
        let wsOptions = {}
        if (selectedUA) {
            const urlObj = new URL(url)
            const originProtocol = urlObj.protocol === 'wss:' ? 'https' : 'http'
            wsOptions = {
                headers: {
                    Origin: `${originProtocol}://${urlObj.hostname}`,
                    'User-Agent': selectedUA,
                },
            }
        }

        this.ws = new WebSocket(url, wsOptions)

        this.ws.on('open', () => {
            this.updateStatus(InstanceStatus.Ok)
            this.log('debug', `Connection opened`)
            if (this.config.reset_variables) this.updateVariables()

            if (this.config.ping_enabled) {
                this.ping_timer = setInterval(() => {
                    if (this.ws?.readyState === WebSocket.OPEN) {
                        this.ws.send(this.hexToBuffer(this.config.ping_hex || '00'), (err) => {
                            if (err) this.log('error', `Ping send failed: ${err.message}`)
                        })
                        if (this.config.debug_messages) {
                            this.log('debug', `Ping sent: ${this.config.ping_hex || '00'}`)
                        }
                    }
                }, this.config.ping_interval || 3000)
            }
        })

        this.ws.on('close', (code) => {
            this.log('debug', `Connection closed with code ${code}`)
            this.updateStatus(InstanceStatus.Disconnected, `Connection closed with code ${code}`)
            if (this.ping_timer) {
                clearInterval(this.ping_timer)
                this.ping_timer = null
            }
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
		if (Buffer.isBuffer(data)) {
			data = data.toString()
		}

		if (typeof data === 'object') {
			msgValue = data
		} else {
			try {
				msgValue = JSON.parse(data)
			} catch (e) {
				msgValue = data
			}
		}

		this.subscriptions.forEach((subscription) => {
			const path = `${this.config.fbprefix}${subscription.subpath}${this.config.fbsuffix}`
			if (subscription.variableName === '') {
				return
			}
			if (subscription.subpath === '') {
				this.setVariableValues({
					[subscription.variableName]: typeof msgValue === 'object' ? JSON.stringify(msgValue) : msgValue,
				})
			} else if (typeof msgValue === 'object' && objectPath.has(msgValue, path)) {
				let value = objectPath.get(msgValue, path)
				this.setVariableValues({
					[subscription.variableName]: typeof value === 'object' ? JSON.stringify(value) : value,
				})
			}
		})
		this.setVariableValues({ lastDataReceived: Date.now() })
	}

	getConfigFields() {
		return [
			{
				type: 'static-text',
				id: 'info',
				width: 12,
				label: 'Information',
				value: '<strong>PLEASE READ THIS!</strong> Generic modules is only for use with custom applications. If you use this module to control a device or software on the market that more than you are using, <strong>PLEASE let us know</strong> about this software, so we can make a proper module for it. If we already support this and you use this to trigger a feature our module doesn\'t support, please let us know. We want companion to be as easy as possible to use for anyone.',
			},
			{
				type: 'textinput',
				id: 'url',
				label: 'Target URL',
				tooltip: 'The URL of the WebSocket server (ws[s]://domain[:port][/path])',
				width: 12,
				regex: '/' + this.wsRegex + '/',
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
				type: 'dropdown',
				id: 'append_new_line',
				label: 'Append termination character',
				choices: [
					{ id: '', label: 'None' },
					{ id: 'rn', label: 'Return+Newline' },
					{ id: 'nr', label: 'Newline+Return' },
					{ id: 'r', label: 'Return' },
					{ id: 'n', label: 'Newline' },
				],
				width: 6,
				default: 'rn',
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
			{
				type: 'textinput',
				id: 'fbprefix',
				label: 'Feedback Prefix',
				tooltip: 'This prefix will be added to all feedbacks "Update variable with value from WebSocket message" in front of the JSON path option.',
				default: '',
				width: 6,
				regex: '/^[\\w\\.\\-_+\\/\\\\\\$ ]*$/',
			},
			{
				type: 'textinput',
				id: 'fbsuffix',
				label: 'Feedback Suffix',
				tooltip: 'This suffix will be added to all feedbacks "Update variable with value from WebSocket message" after the JSON path option.',
				default: '',
				width: 6,
				regex: '/^[\\w\\.\\-_+\\/\\\\\\$ ]*$/',
			},
			// ── User Agent ──────────────────────────────────────────────
			{
				type: 'dropdown',
				id: 'user_agent',
				label: 'User Agent',
				tooltip: 'Simulate a browser to bypass device restrictions',
				width: 6,
				default: 'none',
				choices: [
					{ id: 'none', label: 'None' },
					{ id: 'chrome', label: 'Chrome' },
					{ id: 'firefox', label: 'Firefox' },
					{ id: 'safari', label: 'Safari' },
					{ id: 'custom', label: 'Custom' },
				],
			},
			{
				type: 'textinput',
				id: 'user_agent_custom',
				label: 'Custom User Agent',
				tooltip: 'Enter a custom User-Agent string',
				width: 6,
				default: '',
				isVisible: (config) => config.user_agent === 'custom',
			},
			// ── Ping ────────────────────────────────────────────────────
			{
				type: 'checkbox',
				id: 'ping_enabled',
				label: 'Enable Ping',
				tooltip: 'Send a periodic hex ping to keep the connection alive',
				width: 4,
				default: false,
			},
			{
				type: 'number',
				id: 'ping_interval',
				label: 'Ping Interval (ms)',
				tooltip: 'How often to send the ping in milliseconds',
				width: 4,
				default: 3000,
				min: 500,
				max: 30000,
				isVisible: (config) => config.ping_enabled,
			},
			{
				type: 'textinput',
				id: 'ping_hex',
				label: 'Ping Hex (ex: 00)',
				tooltip: 'Hex bytes to send as keepalive ping',
				width: 4,
				default: '00',
				isVisible: (config) => config.ping_enabled,
			},
		]
	}

	initFeedbacks() {
		this.setFeedbackDefinitions({
			websocket_variable: {
				type: 'advanced',
				name: 'Update variable with value from WebSocket message',
				description: 'Receive messages from the WebSocket and set the value to a variable. Variables can be used on any button.',
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
					return {}
				},
				subscribe: (feedback) => {
					this.subscriptions.set(feedback.id, {
						variableName: `${feedback.options.variable}`,
						subpath: `${feedback.options.subpath}`,
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
					let termination = ''
					switch (this.config.append_new_line) {
						case true:
							termination = '\r\n'
							break
						case 'rn':
							termination = '\r\n'
							break
						case 'nr':
							termination = '\n\r'
							break
						case 'n':
							termination = '\n'
							break
						case 'r':
							termination = '\r'
							break
						default:
							termination = ''
							break
					}

					if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
						this.log('error', `Cannot send command: WebSocket is not connected.`)
						return
					}

					if (this.config.debug_messages) {
						this.log('debug', `Sending message: ${value}`)
					}

					return new Promise((resolve, reject) => {
						this.ws.send(`${value}${termination}`, (err) => {
							if (err) {
								if (this.config.debug_messages) {
									this.log('error', `Sending message failed.`)
								}
								reject(err)
							} else {
								if (this.config.debug_messages) {
									this.log('debug', `Message sent successfully.`)
								}
								resolve()
							}
						})
					})
				},
			},

			send_hex: {
				name: 'Send hex command',
				options: [
					{
						type: 'textinput',
						label: 'Hex (ex: hex:800703...)',
						id: 'data',
						default: 'hex:',
						tooltip: 'Prefix with hex: to send binary data. Example: hex:800703000000000000',
						useVariables: true,
					},
				],
				callback: async (action, context) => {
					const value = await context.parseVariablesInString(action.options.data)

					if (!this.ws || this.ws.readyState !== WebSocket.OPEN) {
						this.log('error', `Cannot send hex: WebSocket is not connected.`)
						return
					}

					const isHex = value.startsWith('hex:')
					const payload = isHex ? this.hexToBuffer(value.substring(4)) : Buffer.from(value)

					if (this.config.debug_messages) {
						this.log('debug', `Sending hex: ${value}`)
					}

					return new Promise((resolve, reject) => {
						this.ws.send(payload, (err) => {
							if (err) {
								if (this.config.debug_messages) {
									this.log('error', `Sending hex failed: ${err.message}`)
								}
								reject(err)
							} else {
								if (this.config.debug_messages) {
									this.log('debug', `Hex sent successfully.`)
								}
								resolve()
							}
						})
					})
				},
			},
		})
	}
}

runEntrypoint(WebsocketInstance, upgradeScripts)
