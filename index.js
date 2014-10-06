'use strict';

var _    = require('lodash');
var fs   = require('fs');
var path = require('path');

var cache;
var lookupCache;

var finalizeResult = function finalizeResult(result) {
  if(result.uaInfoUrl !== 'unknown') {
    result.uaInfoUrl = 'http://user-agent-string.info' + result.uaInfoUrl;
  }

  if(result.uaIcon !== 'unknown') {
    result.uaIcon = 'http://user-agent-string.info/pub/img/ua/' + result.uaIcon;
  }

  if(result.osIcon !== 'unknown') {
    result.osIcon = 'http://user-agent-string.info/pub/img/os/' + result.osIcon;
  }

  if(result.deviceIcon !== 'unknown') {
    result.deviceIcon = 'http://user-agent-string.info/pub/img/device/' + result.deviceIcon;
  }

  if(result.deviceInfoUrl !== 'unknown') {
    result.deviceInfoUrl = 'http://user-agent-string.info' + result.deviceInfoUrl;
  }

  return result;
};

var loadCache = function loadCache(iniFilePath) {
  var iniData = fs.readFileSync(iniFilePath, { encoding: 'utf8' });

  return require('./lib/ini_parser')(iniData);
};

var loadLookupCache = function loadLookupCache(updateInterval) {
  var LRU = require('lru-cache');
  lookupCache = LRU({
    max: 5000,
    maxAge: updateInterval,
  });
};

/*
 * Constructor.
 * @param string cacheDirectory Cache directory for data downloads
 * @param integer updateInterval Allowed age of the cache file.
 * @param bool doDownloads Whether to allow data downloads.
 */
var UASParser = function() {
  this.initialize.apply(this, arguments);
};

module.exports = UASParser;

_.extend(UASParser.prototype, {
  cacheDirectory: path.resolve(__dirname, 'data/'),
  updateInterval: 7 * 24 * 60 * 60 * 1000,
  doDownloads: true,

  initialize: function(cacheDirectory, updateInterval, doDownloads) {
    if (cacheDirectory) {
      this.cacheDirectory = cacheDirectory;
    }
    this.iniFilePath = path.resolve(this.cacheDirectory, 'uasdata.ini');

    if (updateInterval !== undefined) {
      this.updateInterval = updateInterval;
    }

    if (doDownloads !== undefined) {
      this.doDownloads = !!doDownloads;
    }

    if (this.doDownloads) {
      // Update data now!
      this.updateData();
      setInterval(this.updateData, this.updateInterval);
    }
  },

  parse: function(userAgent) {
    var result = {
      type: 'unknown',
      uaFamily: 'unknown',
      uaName: 'unknown',
      uaUrl: 'unknown',
      uaCompany: 'unknown',
      uaCompanyUrl: 'unknown',
      uaIcon: 'unknown.png',
      uaInfoUrl: 'unknown',
      osFamily: 'unknown',
      osName: 'unknown',
      osUrl: 'unknown',
      osCompany: 'unknown',
      osCompanyUrl: 'unknown',
      osIcon: 'unknown.png',
      deviceType: 'unknown',
      deviceIcon: 'unknown.png',
      deviceInfoUrl: 'unknown',
    };

    if (!cache) {
      cache = loadCache(this.iniFilePath);
    }

    for(var i = 0; i < cache.robots.order.length; i++) {
      var robotId = cache.robots.order[i];
      var robot = cache.robots[robotId];

      if(robot.userAgent === userAgent) {
        result.type = 'Robot';
        result = _.extend(result, robot.metadata);
        _.extend(result, cache.device['1']);

        return finalizeResult(result);
      }
    }

    var osId;
    for(i = 0; i < cache.browserReg.order.length; i++) {
      var browserRegId = cache.browserReg.order[i];
      var browserReg = cache.browserReg[browserRegId];

      var matches = userAgent.match(browserReg.regexp);
      if(matches) {
        var browser = cache.browser[browserReg.browserId];
        if(browser) {
          result = _.extend(result, browser.metadata);

          var browserType = cache.browserType[browser.typeId];
          if(browserType) {
            result.type = browserType;
          }

          result.uaName = browser.metadata.uaFamily;
          if(matches[1]) {
            result.uaName += ' ' + matches[1];
          }
        }

        osId = cache.browserOs[browserReg.browserId];

        break;
      }
    }

    if(!osId) {
      for(i = 0; i < cache.osReg.order.length; i++) {
        var osRegId = cache.osReg.order[i];
        var osReg = cache.osReg[osRegId];

        if(osReg.regexp.test(userAgent)) {
          osId = osReg.osId;
          break;
        }
      }
    }

    if(osId) {
      var os = cache.os[osId];
      if(os) {
        result = _.extend(result, os);
      }
    }

    var device;
    if(result.type === 'Robot') {
      device = cache.device['1'];
    } else {
      for(i = 0; i < cache.deviceReg.order.length; i++) {
        var deviceRegId = cache.deviceReg.order[i];
        var deviceReg = cache.deviceReg[deviceRegId];

        if(deviceReg.regexp.test(userAgent)) {
          device = cache.device[deviceReg.deviceId];
          break;
        }
      }
    }

    if(!device) {
      if(['Other', 'Library', 'Validator', 'Useragent Anonymizer'].indexOf(result.type) !==  -1) {
        device = cache.device['1'];
      } else if(['Mobile Browser', 'Wap Browser'].indexOf(result.type) !==  -1) {
        device = cache.device['3'];
      } else {
        device = cache.device['2'];
      }
    }

    if(device) {
      result = _.extend(result, device);
    }

    return finalizeResult(result);
  },

  lookup: function(userAgent) {
    if (!lookupCache) {
      lookupCache = loadLookupCache(this.updateInterval);
    }

    var cached = lookupCache.get(userAgent);
    if (!cached) {
      cached = exports.parse(userAgent);
      lookupCache.set(userAgent, cached);
    }

    return cached;
  },

  updateData: function(callback) {
    var Updater = require('./lib/updater');

    new Updater(this.iniFilePath, this.updateInterval, function(error, newCache) {
      if (!error && newCache) {
        cache = newCache;
      }

      if (callback) {
        callback(error);
      }
    });
  }
});
