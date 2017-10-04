// **********************************************************************************
// Gateway for OpenMiniHub IoT Framework
// **********************************************************************************
// Copyright Martins Ierags, OpenMiniHub (2017)
// **********************************************************************************
var nconf = require('nconf')                                   //https://github.com/indexzero/nconf
var JSON5 = require('json5')                                   //https://github.com/aseemk/json5
var path = require('path')
var serialport = require('serialport')
var dbDir = 'data'
var fs = require("fs")
const execFile = require('child_process').execFile
var readFile = require('n-readlines')
nconf.argv().file({ file: path.resolve(__dirname, 'settings.json5'), format: JSON5 })
settings = nconf.get('settings');
var mqtt = require('mqtt')
var client  = mqtt.connect('mqtt://'+settings.mqtt.server.value+':'+settings.mqtt.port.value, {username:settings.mqtt.username.value, password:settings.mqtt.password.value})
var Datastore = require('nedb')
db = new Datastore({filename : path.join(__dirname, dbDir, settings.database.name.value), autoload: true})

var express     = require('express')
var app         = express()
var bodyParser  = require('body-parser')
var http	= require('http')

//global variable for firmware upload
global.nodeTo = 0

var port = 8080

// get an instance of the router for api routes
var apiRoutes = express.Router()

// use body parser so we can get info from POST and/or URL parameters
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

// start server on our defined port
var server = http.createServer(app).listen(port, function(){
  console.log("Express server listening on port " + port)
})

// 
app.get('/', function(req, res) {
    res.send('Hello! The API is at http://host:' + port + '/api')
})

// route to show a random message (GET http://localhost:8080/api/)
apiRoutes.get('/', function(req, res) {
  res.json({ message: 'OpenMiniHub API running.' })
})

// apply the routes to our application with the prefix /api
app.use('/api', apiRoutes)

serial = new serialport(settings.serial.port.value, { baudrate : settings.serial.baud.value, parser: serialport.parsers.readline("\n"), autoOpen:false})

serial.on('error', function serialErrorHandler(error) {
    //Send serial error messages to console.
    console.error(error.message)
})

serial.on('close', function serialCloseHandler(error) {
    console.error(error.message)
    process.exit(1)
})

serial.on('data', function(data) { processSerialData(data) })

serial.open()

db.persistence.setAutocompactionInterval(settings.database.compactDBInterval.value) //compact the database every 24hrs

global.processSerialData = function (data) {
//  console.log('SERIAL: %s', data)
  handleOutTopic(data)
}

//MQTT
client.on('connect', () => {  
  //on startup subscribe to all node topics
  db.find({ "contact.message.mqtt": { $exists: true }}, function (err, entries) {
    if (!err)
    {
      console.log('==============================');
      console.log('* Subscribing to MQTT topics *');
      console.log('==============================');
      for (var n in entries) {
        //node status topics
        client.subscribe('system/node/'+entries[n]._id+'/status')
        contact = entries[n].contact
          for (var c in contact) {
            message = contact[c].message
              for (var m in message) {
                  // node contact message configuration topics
                  var configNodeTopic = 'system/node/'+entries[n]._id+'/'+contact[c].id+'/'+message[m].type
                  if (message[m].mqtt) //enabled events only
                  {
                    client.subscribe(message[m].mqtt+'/set')
                    console.log('%s', message[m].mqtt);
                    // client.publish(configNodeTopic, message[m].mqtt, {qos: 0, retain: false})
                  }
                  client.subscribe(configNodeTopic+'/set')
              }
          }
      }
      console.log('==============================');
    }
    else
    {
      console.log('ERROR:%s', err)
    }
  })
  //system configuration topics
  client.subscribe('system/gateway')
  client.subscribe('system/node/?/?/?/set')
})

client.on('message', (topic, message) => {
  if (message.toString().trim().length > 0)
  {
    console.log('MQTT: %s %s', topic, message)
    stopic = topic.split('/')
    switch (stopic[0]) {
      case 'system':
        switch (stopic[1]) {
          case 'gateway':
            return handleGatewayMessage(topic, message)
          case 'node':
            return handleNodeMessage(topic, message)
          default:
            return false;
        }
      default:
        return handleSendMessage(topic, message)
    }
  }
  console.log('No handler for topic %s', topic)
})

function handleOutTopic(rxmessage) {
  var message = rxmessage
  var rssiIdx = rxmessage.indexOf(' [RSSI:') //not found = -1
  if (rssiIdx > 0)
    message = rxmessage.substr(0, rssiIdx);
  if (message.toString().trim() == 'FLX?OK')
  {
    if (global.nodeTo)
    {
      readNextFileLine(global.hexFile, 0)
      console.log('Transfering firmware...')
    }
    return true
  }
  if (message.toString().trim() == 'TO:5:OK')
  {
    if (global.nodeTo == 0)
    {
      var toMsg = message.toString().split(':')
      db.find({ _id : toMsg[1] }, function (err, entries) {
        if (entries.length == 1)
        {
          dbNode = entries[0]
          // global.hexFile = new readFile('./firmware/GarageNode/GarageNode_v1.1.hex')
          global.nodeTo = dbNode._id
          nconf.use('file', { file: './firmware/versions.json5' })
          var nodeFirmware = nconf.get('versions:'+dbNode.name+':firmware')
          // console.log('FW > %s', nodeFirmware)
          global.hexFile = new readFile('./firmware/'+nodeFirmware)
          serial.write('FLX?' + '\n', function () { serial.drain(); })
          console.log('Requesting Node: %s update with FW: %s', global.nodeTo, nodeFirmware)
        }
      })
      return true
    }
    else
      return false
  }
  if (message.toString().trim() == 'FLX?NOK')
  {
    console.log('Flashing failed!')
    global.nodeTo = 0
    return false
  }
  if (message.substring(0, (4 > message.length - 1) ? message.length - 1 : 4) == 'FLX:')
  {
    var flxMsg = message.toString().split(':')
    if (flxMsg[1].trim() == 'INV')
    {
      console.log('Flashing failed!')
      global.nodeTo = 0
      return false
     }
    else if (flxMsg[2].trim() == 'OK')
      readNextFileLine(global.hexFile, parseInt(flxMsg[1])+1)
    return true

  }

  console.log('RX > %s', rxmessage)

  var fndMsg = message.toString().split(';')
  //search in db for node
  db.find({ _id : fndMsg[0] }, function (err, entries) {
      var trim_msg = message.replace(/(\n|\r)+$/, '')
      var msg = trim_msg.toString().split(';')
      if (entries.length == 1)
      {
        dbNode = entries[0]
        var foundContact = false
        if (msg[1] < 255) //not internal contact
        {
          for (var c=0; c<dbNode.contact.length; c++) 
          {
            if (dbNode.contact[c].id == msg[1])
            {
              foundContact = true
              if (msg[2] == '1') // Update node value (C_SET)
              {
                var foundMessage = false
                for (var i=0; i<dbNode.contact[c].message.length; i++)
                {
                  if (dbNode.contact[c].message[i].type == msg[4])
                  {
                    foundMessage = true
                    dbNode.contact[c].message[i].value = msg[5]
                    dbNode.contact[c].message[i].updated = new Date().getTime()
                    var updateCon = {$set:{}}   
                    updateCon.$set["contact."+c+".message."+i+".value"] = msg[5]
                    updateCon.$set["contact."+c+".message."+i+".updated"] = new Date().getTime()
                    db.update({ _id: msg[0], "contact.id": msg[1] }, updateCon )

                    if (dbNode.contact[c].message[i].mqtt)
                    {
                      var nodeQOS = 0
                      var nodeRetain = false
                      if (dbNode.contact[c].message[i].qos)
                      {
                        nodeQOS = dbNode.contact[c].message[i].qos
                      }
                      if (dbNode.contact[c].message[i].retain)
                      {
                        nodeRetain = dbNode.contact[c].message[i].retain
                      }
                      client.publish(dbNode.contact[c].message[i].mqtt, msg[msg.length-1], {qos: nodeQOS, retain: nodeRetain})
                      //need to improve feature publish events when no payload provided (only 4 variables received)
                    }
                    break
                  }
                }
                if (!foundMessage)
                {
                  var newMessage = new Object()
                  newMessage.type = msg[4]
                  newMessage.value = msg[5]
                  newMessage.updated = new Date().getTime()
                  newMessage.mqtt = ""
                  newMessage.qos = ""
                  newMessage.retain = ""
                  var updateCon = {$push:{}}   
                  updateCon.$push["contact."+c+".message"] = newMessage
                  db.update({ _id: msg[0], "contact.id": msg[1] }, updateCon )
                }
                //publish message type
                //client.publish('system/node/'+msg[0]+'/'+msg[1]+'/msgtype', msg[4], {qos: 0, retain: false})
                //publish message value
                //client.publish('system/node/'+msg[0]+'/'+msg[1]+'/'+msg[4]+'/value', msg[msg.length-1], {qos: 0, retain: false})  //fix for only 4 variables received
                //subscribe to configuration topic
                client.subscribe('system/node/'+msg[0]+'/'+msg[1]+'/'+msg[4]+'/set')
              }
              if (msg[2]  == '0') // C_PRESENTATION
              {
                var updateCon = {$set:{}}   
                updateCon.$set["contact."+c+".type."] = msg[4]
                db.update({ _id: msg[0], "contact.id": msg[1] }, updateCon )
                client.publish('system/node/'+msg[0]+'/'+msg[1]+'/type', msg[4], {qos: 0, retain: false})
                break
              }
            }
          }
          if (!foundContact)
          {
            var newContact = new Object()
            newContact.id = msg[1]
            newContact.type = msg[4]
            newContact.message = new Array()
            var updateCon = {$push:{}}   
            updateCon.$push["contact"] = newContact
            db.update({ _id: msg[0] }, updateCon )
          }
        } 
        else if (msg[1] == 255 && msg[2] == '3') //Internal presentation message
        {
          if (msg[4] == '11')  //Name
          {
            db.update({ _id: msg[0]}, { $set: { name: msg[5] } })
            client.publish('system/node/'+msg[0]+'/name', msg[5], {qos: 0, retain: false})
	  }
          if (msg[4] == '12')  //Version
          {
            db.update({ _id: msg[0]}, { $set: { version: msg[5] } })
            client.publish('system/node/'+msg[0]+'/version', msg[5], {qos: 0, retain: false})
          }
        }
      }
      else
      {
        //Node not registered: creating the record in db
        dbNode = new Object()
        dbNode._id = msg[0]
        dbNode.name = ""
        dbNode.version = ""
	      dbNode.contact = new Array()

  	    if (msg[2] == '1') // Update node value
	      {
          dbNode.contact[0] = new Object()
	        dbNode.contact[0].id = msg[1]
          dbNode.contact[0].type = ""
          dbNode.contact[0].message = new Array()
          dbNode.contact[0].message[0] = new Object()
          dbNode.contact[0].message[0].type = msg[4]
          dbNode.contact[0].message[0].value = msg[5]
          dbNode.contact[0].message[0].updated = new Date().getTime()
          dbNode.contact[0].message[0].mqtt = ""
          dbNode.contact[0].message[0].qos = ""
          dbNode.contact[0].message[0].retain = ""
	      }
  	    else if (msg[2] == '0')  // Got present message
	      {
          dbNode.contact[0] = new Object()
          dbNode.contact[0].id = msg[1]
          dbNode.contact[0].type=msg[4]
        }
 	      else if (msg[2] == '3') //Got internal message
  	    {
	        if (msg[4] == '11')  //Name
	      	  dbNode.name = msg[5]
	         if (msg[4] == '12')  //Version
	    	    dbNode.version = msg[5]
	      }
  	    // Insert to database
	      db.insert(dbNode, function (err, newEntry) {
            if (err != null)
              console.log('ERROR:%s', err)
              //TO DO: if error that row exists then do update
        })
      }
  })
}

function handleGatewayMessage(topic, message) {
  var splitTopic = topic.toString().split('/')
  //get node list
  if (splitTopic[1] == 'gateway' && splitTopic.length == 2)
  {
    var msg
    try {
      msg = JSON.parse(message);
    } catch (e) {
      return console.error(e)
    }
    switch (msg.cmd) {
      case 'listnew':
        listNodes(false)
        break
      case 'listall':
        listNodes(false)
        break
      case 'updateHRFHJsk':
        fs.open('./.updatenow', "wx", function (err, fd) {
          // handle error
          fs.close(fd, function (err) {
            // handle error
            if (err)
            {
              client.publish('system/gateway', 'previous update in progress', {qos: 0, retain: false})
            }
            else
            {
              client.publish('system/gateway', 'updating', {qos: 0, retain: false})
              const child = execFile('./gateway-update.sh', [''], (error, stdout, stderr) => {
                if (error)
                {
                  client.publish('system/gateway', 'update error', {qos: 0, retain: false})
                }
                console.log(stdout);
              });
            }
          });
        });
        break
      default:
        console.log('No handler for %s %s', topic, message)
    }
  }
  //set gateway to include mode
  if (splitTopic[1] == 'gateway' && splitTopic[2] == 'include' && message == 'enable')
  {
    console.log('include mode')
    serial.write('*i' +  '\n', function () { serial.drain(); })
  }
  //change gateway password
  if (splitTopic[1] == 'gateway' && splitTopic[2] == 'password' && message.length > 0)
  {
    serial.write('*p' + message + '\n', function () { serial.drain(); })
  }
}

function handleNodeMessage(topic, message) {
  var splitTopic = topic.toString().split('/')
  //update node
  if (splitTopic[1] == 'node' && splitTopic[3] == 'status' && splitTopic.length == 4 && message.length > 0)
  {
    if (message == 'update')
      nodeOTA(splitTopic[2])
    if (message == 'waitForUpdate')
      serial.write('*u' + splitTopic[2] + '\n', function () { serial.drain(); });
  }
  //set node contact message MQTT topic
  if (splitTopic[1] == 'node' && splitTopic[5] == 'set' && splitTopic.length == 5 && message.length > 0)
  {
    db.find({ _id : splitTopic[2] }, function (err, entries) {
      if (entries.length == 1)
      {
        dbNode = entries[0]
        var contactFound = false
        for (var c=0; c<dbNode.contact.length; c++)
        {
          if (dbNode.contact[c].id == splitTopic[3])
          {
            for (var m=0; m<dbNode.contact[c].message.length; m++)
            {
              if (dbNode.contact[c].message[m].type == splitTopic[4])
              {
                if (dbNode.contact[c].message[m].mqtt != message)
                {
                  var oldTopic = dbNode.contact[c].message[m].mqtt
                  var updateCon = {$set:{}}
                  updateCon.$set["contact."+c+".message."+m+".mqtt"] = message.toString()
                  db.update({ _id: splitTopic[2], "contact.id": splitTopic[3] }, updateCon )
                  //change subscription
                  client.subscribe(message+'/set')
                  client.unsubscribe(oldTopic+'/set')
                  //exit loop
                  contactFound = true
                  break
                }
              }
            }
          }
          if (contactFound)
            break
        }
      }
    })
  }
}

function handleSendMessage(topic, message) {
  var findTopic = topic.toString().split('/set') //TO DO: remove /set in correct way
  db.find({ "contact.message.mqtt" : findTopic[0] }, function (err, entries) {
    if (!err)
    {
      if (entries.length > 0)
      {
        var mqttTopic = topic.toString().split('/set')
        var dbNode = entries[0]
        for (var c=0; c<dbNode.contact.length; c++)
        {
          for (var m=0; m<dbNode.contact[c].message.length; m++)
          {
            if (dbNode.contact[c].message[m].mqtt == mqttTopic[0])
            {
              console.log('TX > %s;%s;1;1;%s;%s', dbNode._id, dbNode.contact[c].id, dbNode.contact[c].message[m].type, message)
              serial.write(dbNode._id + ';' + dbNode.contact[c].id + ';1;1;' + dbNode.contact[c].message[m].type + ';' + message + '\n', function () { serial.drain(); });
            }
          }
        }
      }
    }
  })
}

function listNodes(listall) {
    db.find({ "contact.message.mqtt" : { $exists: true } }, function (err, entries) {
      if (!err)
      {
        if (entries.length > 0)
        {
          for (var n=0; n<entries.length; n++)
          {
            var dbNode = entries[n]
            for (var c=0; c<dbNode.contact.length; c++)
            {
              for (var m=0; m<dbNode.contact[c].message.length; m++)
              {
                if (listall || !dbNode.contact[c].message[m].mqtt)
                {
                  var newJSON = '{"nodeid": '+dbNode._id+', "contactid": '+dbNode.contact[c].id+', "contacttype": '+dbNode.contact[c].type+', "msgtype": '+dbNode.contact[c].message[m].type+', "value": "'+dbNode.contact[c].message[m].value+'", "mqtt": "'+dbNode.contact[c].message[m].mqtt+'"}'
                  console.log('%s', newJSON)
                  client.publish('system/node', newJSON, {qos: 0, retain: false})
//                  serial.write(dbNode._id + ';' + dbNode.contact[c].id + ';1;1;' + dbNode.contact[c].message[m].type + ';' + message + '\n', function () { serial.drain(); });
                }
              }
            }
          }
        }
      }
    })
}

function nodeOTA(nodeid, firmware) {
    serial.write('TO:' + nodeid + '\n', function () { serial.drain(); });
}

function readNextFileLine(hexFile, lineNumber) {

  var fileLine;
  if (fileLine = hexFile.next()) {
    if (fileLine.toString('ascii').trim() == ":00000001FF")
    {
      global.nodeTo = 0
      console.log('Firmware successfully transfered')
      serial.write('FLX?EOF' + '\n', function () { serial.drain(); });
    }
    else
    {
      serial.write('FLX:' + lineNumber + fileLine.toString('ascii').trim() + '\n', function () { serial.drain(); });
    }
  }
}

//on startup do something
