var instance_skel  = require('../../instance_skel');
const WebSocket    = require('ws');
var objectPath     = require('object-path');

class instance extends instance_skel {
	constructor(system, id, config) {
		super(system, id, config);

		this.ws = null;
		this.subscriptions = new Map();

		this.actions();
		this.initFeedbacks();
		this.subscribeFeedbacks()

		if (!this.config) {
			return this;
		}

		this.initWebSocket();

		return this;
	}

	updateConfig(config) {
		this.config = config;
		this.setVariableDefinitions([{}]);
		this.initWebSocket();
	}

	initWebSocket() {
		var ip = this.config.host;
		var port = this.config.port;
		this.status(this.STATUS_UNKNOWN)
		if (!ip || !port) {
			this.status(this.STATUS_ERROR)
			return;
		}
		this.ws = new WebSocket(`ws://${ip}:${port}`);

		this.ws.on('open', () => {
			this.log('debug', `Connection opened`);
			this.status(this.STATUS_OK)
		});
		this.ws.on('close', () => {
			this.log('debug', `Connection closed`);
			this.status(this.STATUS_ERROR)
		});

		this.ws.on('message', (data) => {
			this.messageReceivedFromWebSocket(data);
		});

		this.ws.on('error', (data) => {
			this.log('error', `WebSocket error: ${data}`);
		});
	}

	messageReceivedFromWebSocket(data) {
		this.log('debug', `Message received: ${data}`);
		var msgValue = null;
		try {
			msgValue = JSON.parse(data);
		} catch (e) {
			msgValue = data;
		}
		this.subscriptions.forEach((subscription) => {
			if (subscription.variableName === '') {
				return;
			}
			if (subscription.subpath === '') {
				this.setVariable(subscription.variableName, typeof msgValue === 'object' ? JSON.stringify(msgValue) : msgValue);
			} else if (typeof msgValue === 'object' && objectPath.has(msgValue, subscription.subpath)) {
				let value = objectPath.get(msgValue, subscription.subpath);
				this.setVariable(subscription.variableName, typeof value === 'object' ? JSON.stringify(value) : value);
			}
		});
	}

	action(action) {
		if (action.action === 'send_command') {
			this.log('debug', `Message sent: ${action.options.data}`);
			this.ws.send(action.options.data+"\r\n");
		}
	}

	config_fields() {
		return [
			{
				type: 'text',
				id: 'info',
				width: 12,
				label: 'Information',
				value: '<strong>PLEASE READ THIS!</strong> Generic modules is only for use with custom applications. If you use this module to control a device or software on the market that more than you are using, <strong>PLEASE let us know</strong> about this software, so we can make a proper module for it. If we already support this and you use this to trigger a feature our module doesn\'t support, please let us know. We want companion to be as easy as possible to use for anyone.'
			},
			{
				type: 'textinput',
				id: 'host',
				label: 'Target host',
				tooltip: 'The host of the WebSocket server',
				width: 6
			},
			{
				type: 'textinput',
				id: 'port',
				label: 'Port',
				tooltip: 'The port of the WebSocket server',
				width: 6,
				regex: this.REGEX_NUMBER
			}
		];
	}

	initFeedbacks() {
		this.setFeedbackDefinitions ( {

			websocket_variable: {
				label: 'Update variable with value from WebSocket message',
				description: 'Receive messages from the WebSocket and set the value to a variable. Variables can be used on any button.',
				options: [
					{
						type: 'textinput',
						label: 'JSON Path (blank if not json)',
						id: 'subpath',
						default: ''
					},
					{
						type: 'textinput',
						label: 'Variable',
						id: 'variable',
						default: ''
					}
				],
				callback: () => {
					// Nothing to do, as this feeds a variable
				},
				subscribe: (feedback) => {
					this.subscriptions.set(feedback.id, {
						variableName: feedback.options.variable,
						subpath: feedback.options.subpath
					});
				},
				unsubscribe: (feedback) => {
					this.subscriptions.delete(feedback.id);
				}
			}
		});
	}

	actions(system) {
		this.setActions({
			'send_command': {
				label: 'Send generic command',
				options: [
					{
						type: 'textinput',
						label: 'data',
						id: 'data',
						default: ''
					}
				]
			}
		});
	}
}

exports = module.exports = instance;
