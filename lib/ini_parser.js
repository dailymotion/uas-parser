'use strict';

var _       = require('lodash');
var lingo   = require('lingo');
var xregexp = require('xregexp').XRegExp;

var compactObject = function compactObject(obj) {
  _.each(obj, function(key, value) {
    if(!value) {
      delete obj[key];
    }
  });

  return obj;
};

var convertRegex = function convertRegex(regexString) {
  // Parse the regex string using the XRegExp library, since it supports the
  // /s (dotall) flag that's present in some of these regexes.
  var match = regexString.match(/^\/(.*)\/([gimynsx]*)\s*$/);
  var xregex = xregexp(match[1], match[2]);

  // XRegExp compiles to a native javascript regex, so pull that native
  // regexp back out, so the regex can easily be dumped to the cache file.
  match = xregex.toString().match(/^\/(.*)\/([gimy]*)$/);
  var regex = new RegExp(match[1], match[2]);

  return regex;
};

var updateOperatingSystems = function updateOperatingSystems(data) {
  for(var i = 0; i < data.os.order.length; i++) {
    var id = data.os.order[i];
    var osArray = data.os[id];
    var os = {
      osFamily: osArray[0],
      osName: osArray[1],
      osUrl: osArray[2],
      osCompany: osArray[3],
      osCompanyUrl: osArray[4],
      osIcon: osArray[5],
    };

    compactObject(os);
    data.os[id] = os;
  }
};

var updateRobots = function updateRobots(data) {
  for(var i = 0; i < data.robots.order.length; i++) {
    var id = data.robots.order[i];
    var robotArray = data.robots[id];
    var robot = {
      userAgent: robotArray[0],
      metadata: {
        uaFamily: robotArray[1],
        uaName: robotArray[2],
        uaUrl: robotArray[3],
        uaCompany: robotArray[4],
        uaCompanyUrl: robotArray[5],
        uaIcon: robotArray[6],
        uaInfoUrl: robotArray[8],
      },
    };

    // Store the operating system metadata directly on the robot record,
    // since it's a hardcoded reference.
    var osId = robotArray[7];
    if(osId) {
      var os = data.os[osId];
      if(os) {
        robot.metadata = _.extend(robot.metadata, os);
      }
    }

    compactObject(robot.metadata);
    data.robots[id] = robot;
  }
};

var updateBrowsers = function updateBrowsers(data) {
  for(var i = 0; i < data.browser.order.length; i++) {
    var id = data.browser.order[i];
    var browserArray = data.browser[id];
    var browser = {
      typeId: browserArray[0],
      metadata: {
        uaFamily: browserArray[1],
        uaUrl: browserArray[2],
        uaCompany: browserArray[3],
        uaCompanyUrl: browserArray[4],
        uaIcon: browserArray[5],
        uaInfoUrl: browserArray[6],
      },
    };

    compactObject(browser.metadata);
    data.browser[id] = browser;
  }
};

var updateBrowserTypes = function updateBrowserTypes(data) {
  for(var i = 0; i < data.browserType.order.length; i++) {
    var id = data.browserType.order[i];
    data.browserType[id] = data.browserType[id][0];
  }
};

var updateBrowserOperatingSystems = function updateBrowserOperatingSystems(data) {
  for(var i = 0; i < data.browserOs.order.length; i++) {
    var id = data.browserOs.order[i];
    data.browserOs[id] = data.browserOs[id][0];
  }
};

var updateBrowserRegexes = function updateBrowserRegexes(data) {
  for(var i = 0; i < data.browserReg.order.length; i++) {
    var id = data.browserReg.order[i];
    var browserRegArray = data.browserReg[id];
    var browserReg = {
      regexp: convertRegex(browserRegArray[0]),
      browserId: browserRegArray[1],
    };

    data.browserReg[id] = browserReg;
  }
};

var updateOperatingSystemRegexes = function updateOperatingSystemRegexes(data) {
  for(var i = 0; i < data.osReg.order.length; i++) {
    var id = data.osReg.order[i];
    var osRegArray = data.osReg[id];
    var osReg = {
      regexp: convertRegex(osRegArray[0]),
      osId: osRegArray[1],
    };

    data.osReg[id] = osReg;
  }
};

var updateDevices = function updateDevices(data) {
  for(var i = 0; i < data.device.order.length; i++) {
    var id = data.device.order[i];
    var deviceArray = data.device[id];
    var device = {
      deviceType: deviceArray[0],
      deviceIcon: deviceArray[1],
      deviceInfoUrl: deviceArray[2],
    };

    compactObject(device);
    data.device[id] = device;
  }
};

var updateDeviceRegexes = function updateDeviceRegexes(data) {
  for(var i = 0; i < data.deviceReg.order.length; i++) {
    var id = data.deviceReg.order[i];
    var deviceRegArray = data.deviceReg[id];
    var deviceReg = {
      regexp: convertRegex(deviceRegArray[0]),
      deviceId: deviceRegArray[1],
    };

    data.deviceReg[id] = deviceReg;
  }
};

module.exports = function(contents) {
  var data = {};

  // Manually parse the ini file line by line. This isn't great, but the
  // parser depends on knowing the order of these entries, so it can check
  // them in order. This is based on how the existing Ruby library parses the
  // ini file.
  //
  // No node.js ini file parses seem to maintain the data's order. The XML
  // download, might be an easier alternative, but it seems to be missing
  // some fields (the robot's url, maybe others).
  var currentSection = 'unknown';
  var lines = contents.toString().split('\n');
  for(var i = 0; i < lines.length; i++) {
    var line = lines[i];
    var optionMatches = line.match(/^(\d+)\[\]\s=\s"(.*)"$/);
    if(optionMatches) {
      var id = optionMatches[1];
      var value = optionMatches[2];

      if(!data[currentSection][id]) {
        data[currentSection][id] = [];
        data[currentSection].order.push(id);
      }

      data[currentSection][id].push(value);
    } else {
      var sectionMatch = line.match(/^\[(\S+)\]$/);
      if(sectionMatch) {
        currentSection = lingo.camelcase(sectionMatch[1].replace('_', ' '));
        data[currentSection] = {
          order: [],
        };
      } else {
        var versionMatch = line.match(/^; Version:\s*(\S+)\s*$/i);
        if(versionMatch) {
          data.version = versionMatch[1];
        }
      }
    }
  }

  // Mutate the data structure into one that's easier to query for parsing
  // purposes.
  updateOperatingSystems(data);
  updateDevices(data);
  updateRobots(data);
  updateBrowsers(data);
  updateBrowserTypes(data);
  updateBrowserOperatingSystems(data);
  updateBrowserRegexes(data);
  updateOperatingSystemRegexes(data);
  updateDeviceRegexes(data);

  return data;
};
