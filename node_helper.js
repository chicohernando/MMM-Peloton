var request = require("request");
const NodeHelper = require("node_helper");
const Log = require("../../js/logger");

module.exports = NodeHelper.create({
	start: function () {
		this.debug("Starting node helper for: " + this.name);

		this.instances = [];
		this.peloton_api_url = "https://api.onepeloton.com/";
	},

	/**
	 * This node_helper keeps track of data per instance that
	 * is loaded on the front end.  It does so by keeping track
	 * of instance data.  This function will create a new instance
	 * keyed by the front end instance_identifier.  It will store
	 * the instance config as part of this instance data along with
	 * other instance specific data accumulated via API calls.
	 *
	 * @param string instance_identifier
	 * @param object config
	 *
	 * @return void
	 */
	createInstance: function(instance_identifier, config) {
		let instance = {};
		
		instance.config = config;
		instance.peloton_session_id = null;
		instance.peloton_user = null;
		instance.peloton_user_id = null;
			
		this.setInstance(instance_identifier, instance);
	},

	/**
	 * Returns the data associated to the instance identified by
	 * instance_identifier.
	 *
	 * @param string instance_identifier
	 *
	 * @return object
	 */
	getInstance: function(instance_identifier) {
		return this.instances[instance_identifier];
	},

	/**
	 * Helper function to relate the instance object to the instance
	 * identified by instance_identifier.
	 *
	 * @param string instance_identifier
	 * @param object instance
	 *
	 * @return void
	 */
	setInstance: function(instance_identifier, instance) {
		this.instances[instance_identifier] = instance;
	},

	/**
	 * Helper function to get the config data from the instance
	 * identified by instance_identifier.
	 *
	 * @param string instance_identifier
	 *
	 * @return object
	 */
	getConfiguration: function(instance_identifier) {
		return this.getInstance(instance_identifier).config;
	},

	/**
	 * Wrapper for Log.log function.  This will use Log.log if the debug
	 * confirguration is true.  This will prefix the name of the module
	 * and the instance identifier to the string_to_log.
	 *
	 * This expects string_to_log to be a string.  If you have an object
	 * that you want to log you should try something like:
	 *
	 *     this.debug(JSON.stringify(object, null, 2));
	 *
	 * instance_identifier is used to determine if the instance has been
	 * configured for debugging.  If instance_identifier is not passed in
	 * then the default is to log the data.
	 *
	 * @param string string_to_log
	 * @param string|null instance_identifier
	 *
	 * @return void
	 */
	debug: function(string_to_log, instance_identifier = null) {
		let should_log = instance_identifier === null || this.getConfiguration(instance_identifier).debug === true;
		let prefix = "";

		if (should_log) {
			if (instance_identifier) {
				prefix = "[" + this.name + ":" + instance_identifier + "] ";
			} else {
				prefix = "[" + this.name + "] ";
			}

			if (typeof Log !== "undefined" && typeof Log.log === "function") {
				Log.log(prefix + string_to_log);
			} else {
				console.log(prefix + string_to_log);
			}
		}
	},

	/**
	 * This function will make it so that the socket notification names
	 * are guaranteed to be unique for our module.  This makes it so
	 * that we do not have to worry about naming collisions with other
	 * modules.
	 *
	 * @param string notification
	 *
	 * @return string
	 */
	normalizeNotification: function(notification) {
		return this.name + "_" + notification;
	},

	/**
	 * This function captures requests from the front end and determines
	 * if the request was meant for this node_helper.  If it is then this
	 * will dispatch the appropriate calls.
	 *
	 * @param string notification
	 * @param object payload
	 *
	 * @return void
	 */
	socketNotificationReceived: function(notification, payload) {
		this.debug("Received socket notification: " + notification);

		switch (notification) {
			case this.normalizeNotification("SET_CONFIG"):
				this.createInstance(payload.instance_identifier, payload.config);
				break;
			case this.normalizeNotification("LOGIN"):
				this.login(payload.instance_identifier);
				break;
			case this.normalizeNotification("REQUEST_USER"):
				this.getUserData(payload.instance_identifier);
				break;
			case this.normalizeNotification("REQUEST_RECENT_WORKOUTS"):
				this.getRecentWorkouts(payload.instance_identifier);
				break;
			case this.normalizeNotification("REQUEST_CHALLENGES"):
				this.getChallenges(payload.instance_identifier);
				break;
		}
	},

	/**
	 * This will attempt to log in via the Peloton API with the credentials
	 * from the module config.
	 *
	 * This function doesn't return anything, however, depending on the API
	 * response it will send an appropriate socket notification to the front
	 * end.
	 *
	 * @param string istance_identifier
	 *
	 * @return void
	 */
	login: function(instance_identifier) {
		let self = this;
		let instance = this.getInstance(instance_identifier);

		this.debug("Logging in as: " + instance.config.username, instance_identifier);
		
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
				headers: {
					"User-Agent": "curl/7.64.0"
				},
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

	/**
	 * This will attempt to retrieve user data via the Peloton API.
	 *
	 * This function doesn't return anything, however, depending on the API
	 * response it will send an appropriate socket notification to the front
	 * end.
	 *
	 * @param string istance_identifier
	 *
	 * @return void
	 */
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

	/**
	 * This will attempt to retrieve recent workouts via the Peloton API.
	 *
	 * This function doesn't return anything, however, depending on the API
	 * response it will send an appropriate socket notification to the front
	 * end.
	 *
	 * @param string istance_identifier
	 *
	 * @return void
	 */
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
	},

	/**
	 * This will attempt to retrieve user challenges via the Peloton API.
	 *
	 * This function doesn't return anything, however, depending on the API
	 * response it will send an appropriate socket notification to the front
	 * end.
	 *
	 * @param string istance_identifier
	 *
	 * @return void
	 */
	getChallenges: function(instance_identifier) {
		let self = this;
		let instance = this.getInstance(instance_identifier);
		this.debug("About to fetch /api/user/" + instance.peloton_user_id + "/challenges/current", instance_identifier);
		
		request({
			headers: {
				Cookie: "peloton_session_id=" + instance.peloton_session_id + ";",
				"peloton-platform": "web"
			},
			url: this.peloton_api_url + "api/user/" + instance.peloton_user_id + "/challenges/current",
			json: true,
			qs: {
				has_joined: true
			}
		}, function(error, response, body) {
			self.debug("Received response for /api/user/" + instance.peloton_user_id + "/challenges/current request", instance_identifier);

			if (error) {
				self.debug(error, instance_identifier);

				self.sendSocketNotification("FAILED_TO_RETRIEVE_CHALLENGE_DATA", {
					instance_identifier: instance_identifier,
				});
			} else if (response.statusCode === 200) {
				self.debug("Successfully retrieved user challenge data", instance_identifier);

				self.sendSocketNotification("RETRIEVED_CHALLENGE_DATA", {
					instance_identifier: instance_identifier,
					body: body
				});
			} else {
				self.debug("Failed to receive data from /api/user/" + instance.peloton_user_id + "/challenges/current", instance_identifier);

				self.sendSocketNotification("FAILED_TO_RETRIEVE_CHALLENGE_DATA", {
					instance_identifier: instance_identifier,
					body: body
				});
			}
		});
	}
});