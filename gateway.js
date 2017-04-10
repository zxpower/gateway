// **********************************************************************************
// Gateway for OpenMiniHub IoT Framework
// **********************************************************************************
// Copyright Martins Ierags, OpenMiniHub (2016)
// **********************************************************************************
var JSON5 = require('json5')
var serialport = require("serialport")
var mqtt = require('mqtt')
var client  = mqtt.connect('mqtt://localhost:1883', {username:"pi", password:"raspberry"})
var Datastore = require('nedb')
db = new Datastore({filename : 'openminihub.db', autoload: true})
userdb = new Datastore({filename : 'users.db', autoload: true})

var express     = require('express')
var app         = express()
var bodyParser  = require('body-parser')
var fs		= require('fs')
var http	= require('http')
var https	= require('https')
var jwt    	= require('jsonwebtoken') // used to create, sign, and verify tokens


var port = 8080
var securityOptions = {
    key: fs.readFileSync('./ssl/server.key'),
    cert: fs.readFileSync('./ssl/server.crt'),
    requestCert: true
}

// get an instance of the router for api routes
var apiRoutes = express.Router()

// use body parser so we can get info from POST and/or URL parameters
app.use(bodyParser.urlencoded({ extended: false }))
app.use(bodyParser.json())

// start secure server on our defined port
var server = https.createServer(securityOptions, app).listen(port, function(){
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

// authenticate the user and give the token to him
apiRoutes.post('/auth', function(req, res) {
  userdb.findOne({ _id: req.body.name }, function(err, user) {
    if (err) throw err
    if (!user) {
      res.json({ success: false, message: 'Authentication failed. User not found.' })
    } else if (user) {
      // check if password matches
      if (user.password != req.body.password) {
        res.json({ success: false, message: 'Authentication failed. Wrong password.' })
      } else {
        // if user is found and password is right
        // create a token
        var token = jwt.sign(user._id, securityOptions.key) //, { expiresIn: '5m' })

        // return the information including token as JSON
        res.json({
          success: true,
          message: 'Enjoy your token!',
          token: token
        })
      }
    }
  })
})

// route middleware to verify a token
apiRoutes.use(function(req, res, next) {
  // check header or url parameters or post parameters for token
  var token = req.body.token || req.query.token || req.headers['x-access-token']

  // decode token
  if (token) {
    // verifies secret and checks exp
    jwt.verify(token, securityOptions.key, function(err, decoded) {
      if (err) {
        return res.json({ success: false, message: 'Failed to authenticate token.' })
      } else {
        // if everything is good, save to request for use in other routes
        req.decoded = decoded
        next()
      }
    })

  } else {
    // if there is no token
    // return an error
    return res.status(403).send({
        success: false,
        message: 'No token provided.'
    })
  }
})

// route to return all nodes (GET http://localhost:8080/api/nodes)
apiRoutes.get('/nodes', function(req, res) {
  db.find({ _id : { $exists: true } }, function (err, entries) {
    res.json(entries)
  })
})

apiRoutes.get('/node/:id', function(req, res) {
  if (req.params.id == 'all') {
    db.find({ _id : { $exists: true } }, function (err, entries) {
      res.json(entries)
    })
  } else {
    db.find({ _id : req.params.id }, function (err, entries) {
      res.json(entries)
    })
  }
//  res.send('no node found')
})

apiRoutes.get('/node/:id/:contact', function(req, res) {
  db.find({ _id : req.params.id, "contact.id" : req.params.contact }, function (err, entries) {
    if (entries.length == 1)
    {
      dbNode = entries[0]
      for (var c=0; c<dbNode.contact.length; c++) 
      {
        if (dbNode.contact[c].id == req.params.contact)
        {
          res.json(dbNode.contact[c])
        }
      }
    }
    else
    {
      res.send('no node found')
    }
  })
})

apiRoutes.get('/node/:id/:contact/:message', function(req, res) {
  db.find({ _id : req.params.id, "contact.id" : req.params.contact }, function (err, entries) {
    var foundMessage = false
    if (entries.length == 1)
    {
      dbNode = entries[0]
      for (var c=0; c<dbNode.contact.length; c++)
      {
        if (dbNode.contact[c].id == req.params.contact)
        {
          for (var m=0; m<dbNode.contact[c].message.length; m++)
          {
            if (dbNode.contact[c].message[m].type == req.params.message)
            {
              foundMessage = true
              res.json(dbNode.contact[c].message[m])
              break
            }
          }
          if (foundMessage)
            break
        }
      }
    }
    if (!foundMessage)
    {
      res.send('no node found')
    }
  })
})

apiRoutes.put('/node/:id/:contact/:message', function(req, res) {
  console.log('mqtt=%s', req.body.mqtt)
  if (!req.body.mqtt)
  {
    res.json({ success: false, message: 'No MQTT specified.' })
  }
  else
  db.find({ _id : req.params.id, "contact.id" : req.params.contact }, function (err, entries) {
    if (err) throw err
    var foundMessage = false
    if (entries.length == 1)
    {
      dbNode = entries[0]
      for (var c=0; c<dbNode.contact.length; c++)
      {
        if (dbNode.contact[c].id == req.params.contact)
        {
          for (var m=0; m<dbNode.contact[c].message.length; m++)
          {
            if (dbNode.contact[c].message[m].type == req.params.message)
            {
              foundMessage = true
              var updateCon = {$set:{}}   
              updateCon.$set["contact."+c+".message."+m+".mqtt"] = req.body.mqtt
              db.update({ _id: req.params.id, "contact.id": req.params.contact }, updateCon )

              res.json({
                success: true,
                message: 'Enjoy your MQTT',
                mqtt: req.body.mqtt
              })
              break
            }
          }
          if (foundMessage)
            break
        }
      }
    }
    if (!foundMessage)
    {
      res.send('no node found')
    }
  })
})
/*
apiRoutes.put('/node/:id', function(req, res) {
  db.findOne({ _id: req.params.id }, function(err, entries) {
    if (err) throw err
    if (!entries) {
      res.json({ success: false, message: 'Node not found.' })
    } else if (entries) {
      // check if mqtt is set
      if (!req.body.mqtt) {
        res.json({ success: false, message: 'No MQTT specified.' })
      } else {
        // if node found and mqtt specified 
	      db.update({ _id: req.params.id}, { $set: {mqtt: req.body.mqtt} })
        // return the information including token as JSON
        res.json({
          success: true,
          message: 'Enjoy your MQTT',
	        mqtt: req.body.mqtt
        })
      }
    }
  })
})
*/
apiRoutes.get('/create', function(req, res) {
  userRow._id='user'
  userRow.password='password'
  userdb.insert(userRow, function (err, newEntry) {
    if (err != null)
      console.log('ERROR:%s', err)
    res.json({ message: 'user added' })
    })
})

// apply the routes to our application with the prefix /api
app.use('/api', apiRoutes)

serial = new serialport('/dev/serial0', { baudrate : 115200, parser: serialport.parsers.readline("\n"), autoOpen:false})

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

db.persistence.setAutocompactionInterval(86400000) //compact the database every 24hrs

global.processSerialData = function (data) {
  console.log('Got: %s', data)
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
//      console.log('mqtt found %j', entries[0]);
      for (var n in entries) {
        contact = entries[n].contact
          for (var c in contact) {
            message = contact[c].message
              for (var m in message) {
                  if (message[m].mqtt) // != null) //enabled events only
                  {
                    client.subscribe(message[m].mqtt+'/set')
                    console.log('%s', message[m].mqtt);
                    //system configuration topics
                    var configNodeTopic = 'system/node/'+entries[n]._id+'/'+contact[c].id+'/'+message[m].type
                    client.publish(configNodeTopic, message[m].mqtt, {qos: 0, retain: true})
                    client.subscribe(configNodeTopic+'/set')
                  }
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
})

client.on('message', (topic, message) => {  
//  stopic = topic.split('/')
//  switch (stopic[0]) {
//    case 'outOMH':
//      return handleOutTopic(message)
//    case 'home':
//      return handleSendMessage(topic, message)
  handleSendMessage(topic, message)
//  }
//  console.log('No handler for topic %s', topic)
})

function handleOutTopic(message) {
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
                client.publish('system/node/'+msg[0]+'/'+msg[1]+'/msgtype', msg[4], {qos: 0, retain: true})
                //publish message value
                client.publish('system/node/'+msg[0]+'/'+msg[1]+'/'+msg[4]+'/value', msg[msg.length-1], {qos: 0, retain: true})  //fix for only 4 variables received
              }
              if (msg[2]  == '0') // C_PRESENTATION
              {
                var updateCon = {$set:{}}   
                updateCon.$set["contact."+c+".type."] = msg[4]
                db.update({ _id: msg[0], "contact.id": msg[1] }, updateCon )
                client.publish('system/node/'+msg[0]+'/'+msg[1]+'/type', msg[4], {qos: 0, retain: true})
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
            client.publish('system/node/'+msg[0]+'/name', msg[5], {qos: 0, retain: true})
	  }
          if (msg[4] == '12')  //Version
          {
            db.update({ _id: msg[0]}, { $set: { version: msg[5] } })
            client.publish('system/node/'+msg[0]+'/version', msg[5], {qos: 0, retain: true})
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
        })
      }
  })
}

function handleSendMessage(topic, message) {
  console.log('mqtt: %s %s', topic, message)
  var findTopic = topic.toString().split('/set')
  var splitTopic = topic.toString().split('/')
  if (splitTopic[0] == 'system' && splitTopic.length > 4 && message.length > 0)
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
  else
  {
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
                console.log('node: %s contact: %s message: %s', dbNode._id, dbNode.contact[c].id, dbNode.contact[c].message[m].type)
                console.log('%s;%s;1;1;%s;%s', dbNode._id, dbNode.contact[c].id, dbNode.contact[c].message[m].type, message)
                serial.write(dbNode._id + ';' + dbNode.contact[c].id + ';1;1;' + dbNode.contact[c].message[m].type + ';' + message + '\n', function () { serial.drain(); });
              }
            }
          }
        }
      }
    })
  }
}
//on startup do something
