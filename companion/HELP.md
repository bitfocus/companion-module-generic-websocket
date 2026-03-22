## Generic WebSocket

### Configuration
* **Target URL**: Type in the URL of the device.  
  The url needs to start with `ws://` or `wss://` and can be an IP or host name optionally with a trailing port number.
* **Reconnect**: The module tries to reconnect automatically if the connection fails.
* **Append termination character**: if and what character(s) to append to a sent string.
* **Debug messages**: Log incomming and outcomming messages if set.
* **Reset variables**: Reset the variables that are defined by feedbacks on init and on connect if set. Otherwise they will stay on the last value.
* **Feedback Prefix**: This prefix will be added to all feedbacks <blockquote>Update variable with value from WebSocket message</blockquote> in front of the JSON path option. The prefix is only added if any path is given, if the path is empty the prefix is ignored for this feedback.
* **Feedback Suffix**: This suffix will be added to all feedbacks <blockquote>Update variable with value from WebSocket message</blockquote> after the JSON path option. The suffix is only added if any path is given, if the path is empty the suffix is ignored for this feedback.
* **User Agent**: Simulate a browser to bypass device restrictions. Some devices only accept connections from browsers. Available options: None, Chrome, Firefox, Safari, Custom.
* **Enable Ping**: Send a periodic hex ping to keep the connection alive. Useful for devices that drop idle connections.
* **Ping Interval (ms)**: How often to send the ping in milliseconds (default: 3000ms). Only visible when ping is enabled.
* **Ping Hex**: Hex bytes to send as keepalive ping (ex: `00`). Only visible when ping is enabled.

---

### Available Actions

#### Send Command
Sends a text or JSON string to the WebSocket server.  
An optional termination character can be appended as configured.

#### Send Hex Command
Sends raw binary data to the WebSocket server.  
Useful for devices that use binary protocols (audio mixers, lighting controllers, video switchers, etc).  
Prefix the value with `hex:` followed by the hex string.  

**Examples:**
| Input | Description |
|---|---|
| `hex:00` | Sends a single null byte |
| `hex:800703000000000000` | Sends 9 bytes of binary data |
| `hex:FF0A1B` | Sends 3 bytes |

**How to find hex commands for your device:**
1. Open your device's web interface in Chrome or Edge
2. Press **F12** → **Network** tab → filter by **WS**
3. Click the WebSocket connection → **Messages**
4. Perform an action on your device and copy the hex bytes shown

---

### Available Feedbacks

#### Update variable with value from WebSocket message
Whenever there is an incoming message it is possible to copy the whole message or a property to a variable.

* **JSON Path**: If left empty, the whole message will be copied to the specified variable name. If there is a value it will be interpreted as a JSON path. If the message contains a stringified JSON-object, that path will be looked up in the object and only the property value will be copied to the variable in a stringified form. You can't use the extended feature set of JSON-path, only simple paths are supported, e.g. `root/1/name`. You can also set a prefix and suffix in the configuration and this will be added to any paths given but not to empty fields.
* **Variable**: The name of the variable to use for this feedback.

---

### Available Variables

* **lastDataReceived**: A unix timestamp of when the last data was received. Sometimes you need to do things whenever the server sends an update. If the sent data doesn't change during update you will not be able to detect if an update has been sent by the data alone. You can use a change of this variable to trigger every time data is received.