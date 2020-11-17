var request = require("request");
const NodeHelper = require("node_helper");
const Log = require("../../js/logger");

module.exports = NodeHelper.create({
	start: function () {
		Log.log("Starting node helper for: " + this.name);
		this.config = null;
		this.instance = null;

		this.peloton_api_url = "https://api.onepeloton.com/";
		this.peloton_session_id = null;
		this.peloton_user = null;
		this.peloton_user_id = null;
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
		} else if (notification === this.normalizeNotification("LOGIN")) {
			this.login();
		} else if (notification === this.normalizeNotification("REQUEST_USER")) {
			this.getUserData();
		} else if (notification === this.normalizeNotification("REQUEST_RECENT_WORKOUTS")) {
			this.getRecentWorkouts();
		}
	},

	login: function() {
		var self = this;
		this.debug("Logging in as: " + this.config.username);
		
		if (this.peloton_session_id) {
			this.debug("Already logged in");
			this.sendSocketNotification("USER_IS_LOGGED_IN");
		} else {
			//User is not already logged in so we need to make an attempt here
			this.peloton_session_id = null;
			this.peloton_user_id = null;
			this.peloton_user = null;

			request({
				url: this.peloton_api_url + "auth/login",
				method: "POST",
				json: true,
				body: {
					username_or_email: this.config.username,
					password: this.config.password
				}
			}, function(error, response, body) {
				self.debug("Received response for login request");
				if (error) {
					self.debug(error);
					self.sendSocketNotification("FAILED_TO_LOG_IN");
				} else if (response.statusCode === 200) {
					self.peloton_user_id = body.user_id;
					self.peloton_session_id = body.session_id;
					self.debug("Successfully logged in");
					self.sendSocketNotification("USER_IS_LOGGED_IN");
				} else {
					self.debug("Failed to authenticate");
					self.sendSocketNotification("FAILED_TO_LOG_IN", body);
				}
			});
		}
	},

	getUserData: function() {
		var self = this;
		this.debug("About to fetch /api/me for: " + this.peloton_session_id);
		
		request({
			headers: {
				Cookie: "peloton_session_id=" + this.peloton_session_id + ";",
				"peloton-platform": "web"
			},
			url: this.peloton_api_url + "api/me",
			json: true
		}, function(error, response, body) {
			self.debug("Received response for api/me request");
			if (error) {
				self.debug(error);
				self.sendSocketNotification("FAILED_TO_RETRIEVE_USER_DATA");
			} else if (response.statusCode === 200) {
				self.debug("Successfully retrieved user data");
				self.peloton_user = body;
				self.sendSocketNotification("RETRIEVED_USER_DATA", self.peloton_user);
			} else {
				self.debug("Failed to receive data from api/me");
				self.sendSocketNotification("FAILED_TO_RETRIEVE_USER_DATA", body);
			}
		});
	},

	getRecentWorkouts: function() {
		var self = this;
		this.debug("About to fetch /api/user/" + this.peloton_user_id + "/workouts");
		
		request({
			headers: {
				Cookie: "peloton_session_id=" + this.peloton_session_id + ";",
				"peloton-platform": "web"
			},
			url: this.peloton_api_url + "api/user/" + this.peloton_user_id + "/workouts",
			json: true,
			qs: {
				joins: "ride,ride.instructor",
				limit: this.config.recent_workouts_limit,
				sort_by: "-created",
				page: 0
			}
		}, function(error, response, body) {
			self.debug("Received response for /api/user/" + this.peloton_user_id + "/workouts request");
			if (error) {
				self.debug(error);
				self.sendSocketNotification("FAILED_TO_RETRIEVE_RECENT_USER_WORKOUT_DATA");
			} else if (response.statusCode === 200) {
				self.debug("Successfully retrieved user workout data");
				self.sendSocketNotification("RETRIEVED_RECENT_WORKOUT_DATA", body);
			} else {
				self.debug("Failed to receive data from /api/user/" + this.peloton_user_id + "/workouts");
				self.sendSocketNotification("FAILED_TO_RETRIEVE_RECENT_USER_WORKOUT_DATA", body);
			}
		});
	}
});