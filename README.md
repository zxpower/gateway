# OpenMiniHub gateway - MQTT gateway for IoT

**OpenMiniHub gateway is an OpenNode IoT MQTT gateway for RaspberryPi** that is compatible with [MySensors.org Serial API v2](https://www.mysensors.org/download/serial_api_20).

## Features:
- Full gateway and node control with MQTT
- Possibility to use local and cloud MQTT broker and easy switch between them
- Written in node.js
- Wireless node update using RFM69_OTA
- [neDB](https://github.com/louischatriot/nedb) storage of node configuration and data
- [nconf](https://github.com/indexzero/nconf) for easy global variable configuration maintenance

## Details & Setup Guide
The full details of how to install this gateway will be published on [web](http://openminihub.com/gateway).

## Quick setup reference
- Do a `git clone https://github.com/openminihub/gateway.git` in `/home/pi` or copy the contents of this directory in `/home/pi/gateway`
- Run `npm install` in the `/home/pi/gateway` directory to install all node dependencies
- Adjust any settings if needed in `settings.json5`
- Connect a GatewayNode to your Pi through the GPIO serial port or USB. The default configured serial port in settings.json5 is `dev/serial0` (GPIO serial port). It should be running [this gateway sketch](https://github.com/OpenMiniHub/openminihub/tree/master/Examples/Gateway).
- Run setup script in the `/home/pi/gateway/setup` directory - `bash setup.sh`

## MQTT API
**For communication with gateway and nodes use MQTT**
- Adding a new node
  On node presenting you will get such MQTT messages:
  ```
  system/node/node_id/name			SW_NAME
  system/node/node_id/version			SW_VERSION
  system/node/node_id/type			[contact type](https://www.mysensors.org/download/serial_api_20#presentation)
  system/node/node_id/contact_id/msgtype		[msg type](https://www.mysensors.org/download/serial_api_20#set,-req)
  system/node/node_id/contact_id/msgtype/value	value
  ```
  example for *Garage door controller* (node id:2, relay on contact:1, contact: S_LOCK, msgtype: V_LOCK_STATUS, value: LOCKED)
  ```
  system/node/2/name		GarageNode
  system/node/2/version		1.0
  system/node/2/1/type		19
  system/node/2/1/msgtype	36
  system/node/2/1/36/value	LOCKED
  ```
- Set the MQTT topic for node contact message
  ```
  system/node/node_id/contact_id/msgtype/set	home/outside/gate/status
  ```
  example:
  ```
  system/node/1/2/2/set				home/outside/gate/status
  ```
- Update node with new firmware
  ```
  system/node/node_id/status	update
  ```
- Update gateway
  ```
  system/gateway	update (feedback messages: updating, updated, update error, previous update in progress)
  ```
## License
This source code is released under GPL 3.0 with the following ammendment:<br/>
You are free to use, copy, distribute and transmit this Software for non-commercial purposes.
For more details see [LICENSE](https://github.com/OpenMiniHub/gateway/LICENSE)

## Credits
[Martins Ierags](http://openminihub.com/contact)
