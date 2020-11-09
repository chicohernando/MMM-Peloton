// const Log = require("../../js/logger");
Module.register("MMM-Peloton", {
	defaults: {
		//authentication
		username: "",
		password: "",

		//workout count summary configuration
		workout_count_configuration: {
			sort_order: "count",
			categories_to_display: ["stretching", "running"],
			should_display_categories_with_zero_count: false
		},

		//development
		debug: false
	},

	start: function () {
		this.peloton_user = null;
		this.debug("MMM-Peloton: Inside start function");
		this.sendSocketNotification(this.normalizeNotification("SET_CONFIG"), this.config);
		this.sendSocketNotification(this.normalizeNotification("LOGIN"));
    },

    getStyles: function() {
    	return ["font-awesome.css", "MMM-Peloton.css"];
    },

    getUserData: function() {
    	this.debug("Requesting user data");
    	this.sendSocketNotification(this.normalizeNotification("REQUEST_USER"));
    },

    getTemplate: function () {
    	return "table.njk";
	},

	getTemplateData: function () {
		var data = {};

		data.config = this.config;
		data.peloton_user = this.peloton_user;
		data.workout_counts = this.getWorkoutCounts();

		return data;
	},

	normalizeNotification: function(notification) {
		return this.name + "_" + notification;
	},

	socketNotificationReceived: function (notification, payload) {
		this.debug('got a notification back!!!!!');
		if (notification === "USER_IS_LOGGED_IN") {
			this.debug("Front end knows that user is logged in");
			this.getUserData();
		} else if (notification === "FAILED_TO_LOG_IN") {
			this.debug("Front end knows that user was not able to log in");
		} else if (notification === "RETRIEVED_USER_DATA") {
			this.debug("Front end knows that user data was retrieved");
			this.peloton_user = payload;
			this.updateDom();
		}
	},

	debug: function(stringToLog) {
		if (this.config.debug) {
			Log.log("[" + this.name + "] " + stringToLog);
		}
	},

	getWorkoutCounts: function() {
		this.debug("Transforming workout counts");
		var workout_counts_to_return = [];

		//if a peloton_user hasn't been set then we can return an empty array
		if (!this.peloton_user) {
			return workout_counts_to_return;
		} else {
			workout_counts_to_return = this.peloton_user.workout_counts;
		}

		//start by keeping workout_counts where the count is greater zero
		if (!this.config.workout_count_configuration.should_display_categories_with_zero_count) {
			workout_counts_to_return = this.peloton_user.workout_counts.filter(function (workout_count) {
				return workout_count.count > 0;
			});
		}

		return workout_counts_to_return;
	}
});