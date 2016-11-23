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
        var token = jwt.sign(user._id, securityOptions.key, { expiresIn: '2 days' })

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

// route to return all users (GET http://localhost:8080/api/users)
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

serial = new serialport('/dev/ttyAMA0', { baudrate : 115200, parser: serialport.parsers.readline("\n"), autoOpen:false})

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
                  if (message[m].mqtt != null) //enabled events only
                  {
                    client.subscribe(message[m].mqtt+'/set')
                    console.log('%s', message[m].mqtt);
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
  var node = message.toString().split(';')
  db.find({ _id : node[0], "contact.id": node[1], "contact.message.type": node[4] }, function (err, entries) {
      var node = message.toString().split(';')
      if (entries.length == 1)
      {
        var dbNode = entries[0]
	if (node[2] == '1') // Update node value (C_SET)
	{
	  db.update({ _id: node[0], "contact.id": node[1], "contact.message.type": node[4]}, { $set: { "contact.message.value": node[5], "contact.message.updated": new Date().getTime() } })

          if (dbNode.contact[0].message[0].mqtt != undefined)
          {
            //need to add feature publish events when no payload provided (only 4 variables received)
            client.publish(dbNode.contact[0].message[0].mqtt, node[5])
          }

	}
	else if (node[2] == '0')  // Got present mesage, update node type (C_PRESENTATION)
	{
	  db.update({ _id: node[0], "contact.id": node[1]}, { $set: { "contact.type": node[4] } })
	}
      }
      else
      {
//        console.log('node:%s c:%s t:%s - NOT in database', node[0], node[1], node[4])
	//Is node registered at all?
	db.find({ _id : node[0] }, function (err, entries) {
	  var node = message.toString().split(';')
//          nodeIdx = node[0]
	  if (entries.length < 1) //new node
	  {
	    console.log('Adding new record')
            dbNode = new Object()
            dbNode._id = node[0]
            dbNode.name = ""
            dbNode.version = ""
	    dbNode.contact = new Array()

	    if (node[2] == '1') // Update node value
	    {
              dbNode.contact[node[1]] = new Object()
	      dbNode.contact[node[1]].id = node[1]
	      dbNode.contact[node[1]].type = ""
              dbNode.contact[node[1]].message = new Array()
              dbNode.contact[node[1]].message[node[4]] = new Object()
	      dbNode.contact[node[1]].message[node[4]].type = node[4]
              dbNode.contact[node[1]].message[node[4]].value = node[5]
              dbNode.contact[node[1]].message[node[4]].updated = new Date().getTime()
	    }
	    else if (node[2] == '0')  // Got present message
	    {
              dbNode.contact[node[1]] = new Object()
              dbNode.contact[node[1]].type=node[4]
	    }
 	    else if (node[2] == '3') //Got internal message
	    {
	      if (node[4] == '11')  //Name
	    	dbNode.name = node[5]
	      if (node[4] == '12')  //Version
	    	dbNode.version = node[5]
	    }
	    //Insert to database
	    db.insert(dbNode, function (err, newEntry) {
              if (err != null)
                console.log('ERROR:%s', err)
            })
          }
	  else
	  {
//	    console.log('something exists')
	    if (node[1] = '255' && node[2] == '3')
            {
              if (node[4] == '11')  //Name
              {
                db.update({ _id: node[0]}, { $set: { name: node[5] } })
              }
              if (node[4] == '12')  //Version
              {
                db.update({ _id: node[0]}, { $set: { version: node[5] } })
              }
            }
	    else
	      db.find({ _id : node[0], "contact.id": node[1] }, function (err, entries) {
	        var node = message.toString().split(';')
	        if (entries.length == 1)
	        {
		  if (node[2] == '1') // Update node value
		  {
		    dbMessage = new Object()
                    dbMessage.type = node[4]
                    dbMessage.value = node[5]
                    dbMessage.updated = new Date().getTime()
                    db.update({ _id: node[0], "contact.id": node[1] }, { $addToSet: { "contact.message" : dbMessage } })
//		    db.update({ _id: node[0], "contact.id": node[1] }, { $set: { "contact.message.type": node[4], "contact.message.value": node[5], "contact.message.updated": new Date().getTime() } })
		  }
		  if (node[2] == '0')
		    db.update({ _id: node[0], "contact.id": node[1] }, { $set: { "contact.type": node[4] } })
	        }
	        else
	        {
                  if (node[2] == '1') // Update node value
		  {
         	    dbMessage = new Object()
                    dbMessage.type = node[4]
                    dbMessage.value = node[5]
                    dbMessage.updated = new Date().getTime()
                    db.update({ _id: node[0], "contact.id": node[1] }, { $addToSet: { "contact.message" : dbMessage } })
	   	  }
                  if (node[2] == '0')
		  {
		    dbContact = new Object()
                    dbContact.id = node[1]
                    dbContact.type = node[4]
                    dbContact.message = new Array()
		    db.update({ _id: node[0] }, { $addToSet: { contact: dbContact } })
		  }
	        }
	    })
	  }
       })
     }
  })
}

function handleSendMessage(topic, message) {
  var topicByIndex = topic.toString().split('/set')
  console.log('mqtt: %s %s', topicByIndex[0], message)
  db.find({ "contact.message.mqtt" : topicByIndex[0] }, function (err, entries) {
    if (!err) 
    {
      if (entries.length == 1)
      {
        var dbNode = entries[0]
        var nodeId = dbNode._id
        var contactId = dbNode.contact[0].id
	var messageType = dbNode.contact[0].message[0].type
        console.log('node: %s contact: %s', nodeId, contactId)
	console.log('%s;%s;1;1;%s;%s', nodeId, contactId, messageType, message)
	serial.write(nodeId + ';' + contactId + ';1;1;' + messageType + ';' + message + '\n', function () { serial.drain(); });
      }
    }
  })
}

//on startup do something
