export const upgradeScripts = [
	function v2_1(context, props) {
		const result = {
			updatedConfig: null,
			updatedActions: [],
			updatedFeedbacks: [],
		}
		if (props.config) {
			let config = props.config
			if (config.url === undefined) {
				let host = 'localhost'
				let port = null
				if (config.host) {
					host = config.host
					delete config.host
				}
				if (config.port) {
					port = config.port
					delete config.port
				}
				config.url = 'ws://' + host + (port ? ':' + port : '')
			}
			if (config.append_new_line === undefined) {
				config.append_new_line = true
			}
			result.updatedConfig = config
		}
		return result
	},
]
