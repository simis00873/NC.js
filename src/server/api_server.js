#!/usr/bin/node
/* 
 * Copyright (c) 2016-2017 by STEP Tools Inc. 
 * Copyright G. Hemingway 2015
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 * 
 *     http://www.apache.org/licenses/LICENSE-2.0
 * 
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 * 
 */

'use strict';

var http = require('http');
var path = require('path');
var io = require('socket.io');
var ioSession = require('socket.io-express-session');
var expSession = require('express-session');
var express = require('express');
var compression = require('compression');
var bodyParser = require('body-parser');
var cookieParser = require('cookie-parser');
var jade = require('jade');
var CoreServer = require('./core_server');
var util = require('util');
var EventEmitter = require('events');

/************************* Support Site *********************************/

var COOKIE_SECRET = 'imhotep';
var app;

function APIServer() {
  CoreServer.call(this);
  // Setup the session
  this.events=new EventEmitter();
  this.session = expSession({
    cookie: {httpOnly: false},
    secret: COOKIE_SECRET,
    resave: false,
    saveUninitialized: false,
  });
  // Set up the rest
  this._setExpress();
  this._setSocket();
  var self = this;
  this._setRoutes(function() {
    self._setSite();
  });
}
util.inherits(APIServer, CoreServer);

/*
 * Setup Express Frontend
 */
// Calculate sha1 hash of the file object
APIServer.prototype._setExpress = function() {
  this.express = express();
  this.express.disable('x-powered-by');
  // prevents caching in Edge
  this.express.use(function noCache(req, res, next) {
    let browser = req.headers['user-agent'];
    // add browser.includes('rv') for IE
    if (browser.includes('Edge')) {
      res.header('Cache-Control', 'no-cache, no-store, must-revalidate');
      res.header('Pragma', 'no-cache');
      res.header('Expires', 0);
    }
    next();
  });
  this.express.use(
    require('serve-favicon')
    (__dirname + '/../../public/img/favicon.ico')
  );
  this.express.use(bodyParser.urlencoded({extended: true}));
  this.express.use(bodyParser.json());
  this.express.use(cookieParser('imhotep'));
  this.express.use(this.session);
  this.express.use(require('method-override')());
  this.express.use(
    require('serve-static')
    (path.join(__dirname, '/../../public'))
  );
  this.express.use(require('morgan')('tiny'));
  this.express.use(require('compression')());
  this.express.engine('jade', jade.__express);
  this.express.set('views', path.join(__dirname, '/views'));
  // Create the core router
  this.router = express.Router();
  this.express.use(this.router);
};

/*
 * Setup the socket server
 */
APIServer.prototype._setSocket = function() {
  // Socket server
  this.server = http.Server(this.express);
  this.ioServer = io(this.server, {});
  this.ioServer.use(ioSession(this.session));
  this.ioServer.on('connection', function(socket) {
    socket.on('disconnect', function() {});
  });
};

/*
 * Core API Routes
 */
APIServer.prototype._setRoutes = function(cb) {
  var self = this;
  require('./api/v3/step')(self, function() {
    require('./api/v3/tool')(self, function() {
      require('./api/v3/tolerances')(self, function() {
        require('./api/v3/geometry')(self, function() {
          require('./api/v3/changelog')(self, function() {
            require('./api/v3/custom')(self, function() {
              if (self.config.mtConnect){
		require('./api/v3/MTstate')(self, function () {
                  if (cb) {
                    cb();
                  }
		});
              } else {
		require('./api/v3/state')(self, function () {
                  if (cb) {
                    cb();
                  }
		});
              }
            });
          });
        });
      });
    });
  });
};

/*
 * Static Site
 */
APIServer.prototype._setSite = function() {
  var self = this;
  var endpoint = '';
  if (this.config.host) {
    endpoint = this.config.protocol + '://' + this.config.host + ':' + app.port;
  }
  var services = {
    apiEndpoint: endpoint,
    socket: '',
    version: '/v3',
    machine: self.machinetool,
  };
  // Serve the root client framework - customized as needed
  var _serveRoot = function (req, res) {
    var appConfig = {
      title: 'NC.js',
      source: '/js/main.js',
      services: services,
      config: self.config.client
    };
    res.render('base.jade', appConfig);
  };

  this.router.get('/', _serveRoot);
  this.router.get('*', function(req, res) {
    res.status(404).send('404 Error: Not Found');
  });
};

/*
 * Primary run
 */
APIServer.prototype.run = function() {
  var self = this;
  this.server.listen(app.port, function() {
    self.logger.info('CAD.js API Server listening on: ' + app.port);
  });


  process.openStdin().addListener('data', function(inputData) {
    if ((self.server !== null) && (self.server !== 'undefined')) {
      inputData=inputData.toString().trim().toLowerCase();
      if (inputData.length === 0) {
        process.exit(0);
      }
    }
  });
};

/***************************** Run the server *********************************/

app = new APIServer();
app.run();
