'use strict';

var _        = require('lodash');
var async    = require('async');
var crypto   = require('crypto');
var fs       = require('fs');
var lockFile = require('lockfile');
var request  = require('request');

var cache;

var loadCache = function loadCache(iniFilePath, callback) {
  fs.readFile(iniFilePath, { encoding: 'utf8' }, function(err, iniData) {
    if (err) {
      callback(err);
    }
    else {
      callback(null, require('./ini_parser')(iniData));
    }
  });
};

/*
 * Constructor.
 * @param string iniFilePath The ini cache file path.
 * @param integer updateInterval Allowed age of the cache file.
 * @param function callback The callback that receives the up-to-date ini file content.
 */
var Updater = function() {
  this.initialize.apply(this, arguments);
};

module.exports = Updater;

_.extend(Updater.prototype, {
  dataUrl: 'http://user-agent-string.info/rpc/get_data.php?key=free&format=ini',
  versionUrl: 'http://user-agent-string.info/rpc/get_data.php?key=free&format=ini&ver=y',
  checksumUrl: 'http://user-agent-string.info/rpc/get_data.php?format=ini&sha1=y',

  initialize: function(iniFilePath, updateInterval, callback) {
    this.iniFilePath = iniFilePath;
    this.updateInterval = updateInterval;

    this.updateCallback = callback;
    this.cacheLockPath = [iniFilePath, '.lock'].join('');

    // Perform a lock while updating the cache to ensure only one process
    // is updating the cache at a time.
    lockFile.lock(this.cacheLockPath, { stale: 60 * 1000 }, function(error) {
      loadCache(this.iniFilePath, function(_cache) {
        cache = _cache;
        if (error) {
          this.finish(null, cache);
          return true;
        }

        fs.stat(this.iniFilePath, this.handleFileStat.bind(this));
      }.bind(this));
    }.bind(this));
  },

  handleFileStat: function(error, stats) {
    if(error) {
      this.finish(error);
      return false;
    }

    if(stats.mtime.getTime() < new Date().getTime() - this.updateInterval) {
      this.checkVersion();
    } else {
      this.finish(null, cache);
    }
  },

  checkVersion: function() {
    console.info('[uas-parser] Checking user-agent-string.info for new version');
    request(this.versionUrl, this.handleCheckVersion.bind(this));
  },

  handleCheckVersion: function(error, response, body) {
    if(error) {
      this.updateCallback(error);
      return false;
    }

    if(cache && cache.version) {
      if(cache.version !== body) {
        this.download();
      } else {
        console.info('[uas-parser] Version up to date');
        this.updateCallback(null, cache);
      }
    } else {
      this.download();
    }
  },

  finish: function(error, cache) {
    lockFile.unlock(this.cacheLockPath, function(error) {
      this.updateCallback(error, cache);
    }.bind(this));
  },

  download: function() {
    console.info('[uas-parser] Downloading new data');
    async.parallel([
      this.downloadChecksum.bind(this),
      this.downloadData.bind(this),
    ], this.handleDownload.bind(this));
  },

  downloadChecksum: function(callback) {
    request(this.checksumUrl, function(error, response, body) {
      if(!error) {
        callback(null, body);
      } else {
        callback(error);
      }
    });
  },

  downloadData: function(callback) {
    request(this.dataUrl, function(error, response, body) {
      if(!error) {
        callback(null, body);
      } else {
        callback(error);
      }
    });
  },

  handleDownload: function(error, results) {
    if(error) {
      console.error('Download error: ', error);
      this.updateCallback(error);
      return false;
    } else {
      var checksum = results[0];
      var data = results[1];

      var dataChecksum = crypto.createHash('sha1').update(data, 'utf8').digest('hex');
      if(dataChecksum !== checksum) {
        console.error('Checksum mismatch (expected: ' + checksum + ', got: ' + dataChecksum + ')');
        this.updateCallback('Checksum mismatch');
        return false;
      } else {
        // Dump the raw ini file.
        fs.writeFile(this.iniFilePath, data, this.handleWriteData.bind(this));
      }
    }
  },

  handleWriteData: function(error) {
    console.info('[uas-parser] Installed new data');

    if(error) {
      this.updateCallback(error);
      return false;
    }

    // Refresh the cache out of the newly written file.
    cache = loadCache(this.iniFilePath);

    this.updateCallback(null, cache);
  }
});
