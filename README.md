RaspberryPi gateway for IoT OpenMiniHub (compatible with MySensors.org)
----------------
By Martins Ierags (openminihub.com/contact)
<br/>

###Features:
- SSL Encrypted with self signed certificate
- realtime websocket driven using node.js and socket.io
- [neDB](https://github.com/louischatriot/nedb) storage of node data and logs
- [nconf](https://github.com/indexzero/nconf) for easy global variable configuration maintenance

###License
This source code is released under GPL 3.0 with the following ammendment:<br/>
You are free to use, copy, distribute and transmit this Software for non-commercial purposes.
For more details see [LICENSE](https://github.com/OpenMiniHub/gateway/LICENSE)

###Details & Setup Guide
The full details of how to install this stack along with supporting webserver will be published on [web](http://openminihub.com/gateway).

###Quick reference:
- Do a 'git clone https://github.com/openminihub/gateway.git' in '/home/pi' or copy the contents of this directory in `/home/pi/gateway`
- run `npm install` in the `/home/pi/gateway` directory to install all node dependencies
- Adjust any email/password/SMS settings in `settings.json5`
- Connect a GatewayNode to your Pi through the serial port or USB. The default configured serial port in settings.json5 is `dev/ttyAMA0` which corresponds to the GPIO serial port, this works for a GatewayNode directly attached to the GPIO; if you have a GatewayNode plugged into a USB port then you will need to find which serial port that will generate and replace it in `settings.json5` (it is usually something like `dev/ttyUSBxx`). It should be running [this gateway sketch](https://github.com/OpenMiniHub/openminihub/tree/master/Examples/SerialGateway).
- if you are using a wi-fi dongle, edit your wifi password in `/etc/wpa_supplicant/wpa_supplicant.conf`
- Ensure your `gateway.js` script runs at boot (see the [Pi Stack Setup guide for how to set that up with upstart](http://lowpowerlab.com/gateway/#pisetup) and the [Gateway app setup](http://lowpowerlab.com/gateway/#sourcecode)). You can always use the pre-compiled Pi image that has all these things ready to go (except the settings which you should revisit anyway); this image also has upstart already configured to run the `gateway.js` app at startup. Otherwise if you want to manually start the `gateway.js` app or see the output it generates to the console start it with `node gateway.js &`. If you want to manually start it and ensure it persists after you logout use `nohup node gateway.js &`

###Video Overview & Demo
no video at this moment
