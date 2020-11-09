// const Log = require("../../js/logger");
Module.register("MMM-Peloton", {
	defaults: {
		text: "Hello, Peloton!",
		username: "",
		debug: false
	},

	start: function () {
		var self = this;
		this.debug("MMM-Peloton: Inside start function");
		this.sendSocketNotification(this.normalizeNotification("SET_CONFIG"), this.config);
		this.getUserData();
    },

    getUserData: function() {
    	this.debug("Requesting user data");
    	var data = {
    		username: this.config.username
    	};
    	this.sendSocketNotification(this.normalizeNotification("REQUEST_USER"), data);
    },

    getTemplate: function () {
    	return "table.njk";
	},

	getTemplateData: function () {
		var data = {};
		data.config = this.config;
		return data;
	},

	normalizeNotification: function(notification) {
		return this.name + "_" + notification;
	},

	socketNotificationReceived: function (notification, payload) {
		this.debug('got a notification back!!!!!');
	},

	debug: function(stringToLog) {
		if (this.config.debug) {
			Log.log("[" + this.name + "] " + stringToLog);
		}
	}
});