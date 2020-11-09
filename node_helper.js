var request = require("request");
const NodeHelper = require("node_helper");
const Log = require("../../js/logger");

module.exports = NodeHelper.create({
	start: function () {
		console.log("Starting node helper for: " + this.name);
		this.config = null;
		this.instance = null;
	},

	debug: function(stringToLog) {
		if (this.config !== null && this.config.debug) {
			Log.log("[" + this.name + "] " + stringToLog);
		}
	},

	normalizeNotification: function(notification) {
		return this.name + "_" + notification;
	},

	socketNotificationReceived: function(notification, payload) {
		var self = this;
		this.debug("Received socket notification: " + notification);
		if (notification === this.normalizeNotification("SET_CONFIG")) {
			this.config = payload;
		} else if (notification === this.normalizeNotification("REQUEST_USER")) {
			this.getUserData(this.config.username);
		}
	},

	getUserData: function(username) {
		this.debug("About to fetch user data for: " + username);
		
		var user_data = {};
		this.sendSocketNotification("REQUEST_USER_RESPONSE", user_data);
	}
});