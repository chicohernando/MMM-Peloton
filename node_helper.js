var request = require("request");
const NodeHelper = require("node_helper");
const Log = require("../../js/logger");

module.exports = NodeHelper.create({
	start: function () {
		Log.log("Starting node helper for: " + this.name);

		this.instances = [];
		this.peloton_api_url = "https://api.onepeloton.com/";
	},

	createInstance: function(instance_identifier, config) {
		let instance = {};
		
		instance.config = config;
		instance.peloton_session_id = null;
		instance.peloton_user = null;
		instance.peloton_user_id = null;
			
		this.setInstance(instance_identifier, instance);
	},

	getInstance: function(instance_identifier) {
		return this.instances[instance_identifier];
	},

	setInstance: function(instance_identifier, instance) {
		this.instances[instance_identifier] = instance;
	},

	getConfiguration: function(instance_identifier) {
		return this.getInstance(instance_identifier).config;
	},

	debug: function(stringToLog, instance_identifier = null) {
		let should_log = instance_identifier === null || this.getConfiguration(instance_identifier).debug === true;
		
		if (should_log) {
			Log.log("[" + this.name + "] " + stringToLog);
		}
	},

	normalizeNotification: function(notification) {
		return this.name + "_" + notification;
	},

	socketNotificationReceived: function(notification, payload) {
		this.debug("Received socket notification: " + notification);

		if (notification === this.normalizeNotification("SET_CONFIG")) {
			this.createInstance(payload.instance_identifier, payload.config);
		} else if (notification === this.normalizeNotification("LOGIN")) {
			this.login(payload.instance_identifier);
		} else if (notification === this.normalizeNotification("REQUEST_USER")) {
			this.getUserData(payload.instance_identifier);
		} else if (notification === this.normalizeNotification("REQUEST_RECENT_WORKOUTS")) {
			this.getRecentWorkouts(payload.instance_identifier);
		}
	},

	login: function(instance_identifier) {
		let self = this;
		let instance = this.getInstance(instance_identifier);

		this.debug("Logging in as: " + instance.config.username);
		
		if (instance.peloton_session_id) {
			this.debug("Already logged in", instance_identifier);
			
			this.sendSocketNotification("USER_IS_LOGGED_IN", {
				instance_identifier: instance_identifier
			});
		} else {
			//User is not already logged in so we need to make an attempt here
			instance.peloton_session_id = null;
			instance.peloton_user_id = null;
			instance.peloton_user = null;

			this.setInstance(instance_identifier, instance);

			request({
				url: this.peloton_api_url + "auth/login",
				method: "POST",
				json: true,
				body: {
					username_or_email: instance.config.username,
					password: instance.config.password
				}
			}, function(error, response, body) {
				self.debug("Received response for login request", instance_identifier);
				if (error) {
					self.debug(error, instance_identifier);

					self.sendSocketNotification("FAILED_TO_LOG_IN", {
						instance_identifier: instance_identifier
					});
				} else if (response.statusCode === 200) {
					self.debug("Successfully logged in", instance_identifier);

					instance.peloton_user_id = body.user_id;
					instance.peloton_session_id = body.session_id;
					self.setInstance(instance_identifier, instance);
					
					self.sendSocketNotification("USER_IS_LOGGED_IN", {
						instance_identifier: instance_identifier
					});
				} else {
					self.debug("Failed to authenticate", instance_identifier);

					self.sendSocketNotification("FAILED_TO_LOG_IN", {
						instance_identifier: instance_identifier,
						body: body
					});
				}
			});
		}
	},

	getUserData: function(instance_identifier) {
		let self = this;
		let instance = this.getInstance(instance_identifier);
		this.debug("About to fetch /api/me for: " + instance.peloton_session_id, instance_identifier);
		
		request({
			headers: {
				Cookie: "peloton_session_id=" + instance.peloton_session_id + ";",
				"peloton-platform": "web"
			},
			url: this.peloton_api_url + "api/me",
			json: true
		}, function(error, response, body) {
			self.debug("Received response for api/me request", instance_identifier);
			if (error) {
				self.debug(error, instance_identifier);

				self.sendSocketNotification("FAILED_TO_RETRIEVE_USER_DATA", {
					instance_identifier: instance_identifier,
				});
			} else if (response.statusCode === 200) {
				self.debug("Successfully retrieved user data", instance_identifier);

				instance.peloton_user = body;
				self.setInstance(instance_identifier, instance);
				self.sendSocketNotification("RETRIEVED_USER_DATA", {
					instance_identifier: instance_identifier,
					peloton_user: instance.peloton_user
				});
			} else {
				self.debug("Failed to receive data from api/me", instance_identifier);

				self.sendSocketNotification("FAILED_TO_RETRIEVE_USER_DATA", {
					instance_identifier: instance_identifier,
					body: body
				});
			}
		});
	},

	getRecentWorkouts: function(instance_identifier) {
		let self = this;
		let instance = this.getInstance(instance_identifier);
		this.debug("About to fetch /api/user/" + instance.peloton_user_id + "/workouts", instance_identifier);
		
		request({
			headers: {
				Cookie: "peloton_session_id=" + instance.peloton_session_id + ";",
				"peloton-platform": "web"
			},
			url: this.peloton_api_url + "api/user/" + instance.peloton_user_id + "/workouts",
			json: true,
			qs: {
				joins: "ride,ride.instructor",
				limit: instance.config.recent_workouts_limit,
				sort_by: "-created",
				page: 0
			}
		}, function(error, response, body) {
			self.debug("Received response for /api/user/" + instance.peloton_user_id + "/workouts request", instance_identifier);

			if (error) {
				self.debug(error, instance_identifier);

				self.sendSocketNotification("FAILED_TO_RETRIEVE_RECENT_USER_WORKOUT_DATA", {
					instance_identifier: instance_identifier,
				});
			} else if (response.statusCode === 200) {
				self.debug("Successfully retrieved user workout data", instance_identifier);

				self.sendSocketNotification("RETRIEVED_RECENT_WORKOUT_DATA", {
					instance_identifier: instance_identifier,
					body: body
				});
			} else {
				self.debug("Failed to receive data from /api/user/" + instance.peloton_user_id + "/workouts", instance_identifier);

				self.sendSocketNotification("FAILED_TO_RETRIEVE_RECENT_USER_WORKOUT_DATA", {
					instance_identifier: instance_identifier,
					body: body
				});
			}
		});
	}
});