// const Log = require("../../js/logger");
Module.register("MMM-Peloton", {
	defaults: {
		//authentication
		username: "",
		password: "",

		display_type: "workout_count",                                 //supported values are: workout_count and recent_workouts

		//workout count summary configuration
		workout_count_categories_to_omit: [],                          //supported values to omit are: cardio, circuit, cycling, meditation, running, strength, walking, yoga
		workout_count_should_display_categories_with_zero_count: true, //true or false
		workout_count_sort_order: "alpha_asc",                         //supported values are: alpha_asc, alpha_desc, count_asc, count_desc

		recent_workouts_limit: 5,                                      //number in the range of [1, 10]

		//development
		debug: false                                                   //true or false
	},

	start: function () {
		this.peloton_user = null;
		
		if (this.config.recent_workouts_limit < 1 || this.config.recent_workouts_limit > 10) {
			this.config.recent_workouts_limit = 5;
		}

		this.addTemplateFilters();
		this.sendSocketNotification(this.normalizeNotification("SET_CONFIG"), {
			instance_identifier: this.identifier,
			config: this.config
		});
		this.sendSocketNotification(this.normalizeNotification("LOGIN"), {
			instance_identifier: this.identifier
		});
    },

    getStyles: function() {
    	return ["font-awesome.css", "MMM-Peloton.css"];
    },

	requestUserData: function() {
		this.debug("Requesting user data");

		this.sendSocketNotification(this.normalizeNotification("REQUEST_USER"), {
			instance_identifier: this.identifier
		});
	},

	requestRecentWorkouts: function() {
		this.debug("Requesting recent workout data");

		this.sendSocketNotification(this.normalizeNotification("REQUEST_RECENT_WORKOUTS"), {
			instance_identifier: this.identifier
		});
	},

	getRecentWorkouts: function() {
		this.debug("Transforming recent workouts");

		let recent_workouts = [];

		if (this.peloton_recent_workouts) {
			//copy the recent workouts
			recent_workouts = this.peloton_recent_workouts.data;

			//limit the number of recent workouts to first five
			recent_workouts = recent_workouts.slice(0, this.config.recent_workouts_limit);
		}

		return recent_workouts;
	},

	getScripts: function () {
		return ["moment.js"];
	},

    getTemplate: function () {
		let template_name = null;

		switch (this.config.display_type) {
			case "workout_count":
			case "recent_workouts":
				template_name = this.config.display_type + ".njk";
				break;
			default:
				template_name = "undefined_display_type.njk";
				break;
		}

		return template_name;
	},

	getTemplateData: function () {
		let data = {};

		data.config = this.config;
		data.peloton_user = this.peloton_user;

		switch (this.config.display_type) {
			case "workout_count":
				data.workout_counts = this.getWorkoutCounts();
				break;
			case "recent_workouts":
				data.recent_workouts = this.getRecentWorkouts();
				break;
		}
		
		return data;
	},

	normalizeNotification: function(notification) {
		return this.name + "_" + notification;
	},

	socketNotificationReceived: function (notification, payload) {
		if (payload.instance_identifier == this.identifier) {
			if (notification === "USER_IS_LOGGED_IN") {
				this.debug("Front end knows that user is logged in");
				this.requestUserData();
				
				if (this.config.display_type == "recent_workouts") {
					this.requestRecentWorkouts();
				}
			} else if (notification === "FAILED_TO_LOG_IN") {
				this.debug("Front end knows that user was not able to log in");
			} else if (notification === "RETRIEVED_USER_DATA") {
				this.debug("Front end knows that user data was retrieved");
				this.peloton_user = payload.peloton_user;
				this.updateDom();
			} else if (notification === "RETRIEVED_RECENT_WORKOUT_DATA") {
				this.debug("Front end retrieved recent workout data");
				this.peloton_recent_workouts = payload.body;
				this.updateDom();
			}
		}
	},

	debug: function(stringToLog) {
		if (this.config.debug) {
			Log.log("[" + this.name + "] " + stringToLog);
		}
	},

	getWorkoutCounts: function() {
		this.debug("Transforming workout counts");

		let self = this;
		let workout_counts_to_return = [];

		//if a peloton_user hasn't been set then we can return an empty array
		if (!this.peloton_user) {
			return workout_counts_to_return;
		} else {
			workout_counts_to_return = this.peloton_user.workout_counts;
		}

		//start by keeping workout_counts where the count is greater zero
		if (!this.config.workout_count_should_display_categories_with_zero_count) {
			workout_counts_to_return = workout_counts_to_return.filter(function (workout_count) {
				return workout_count.count > 0;
			});
		}

		//remove workouts that users don't want to see
		workout_counts_to_return = workout_counts_to_return.filter(function(workout_count) {
			return !self.config.workout_count_categories_to_omit.includes(workout_count.slug);
		});

		//sort workouts based on configuration
		switch (self.config.workout_count_sort_order) {
			case "alpha_asc":
				workout_counts_to_return.sort(function(left, right) {
					return left.name == right.name ? 0 : left.name > right.name ? 1 : -1;
				});
				break;
			case "alpha_desc":
				workout_counts_to_return.sort(function(left, right) {
					return left.name == right.name ? 0 : left.name < right.name ? 1 : -1;
				});
				break;
			case "count_asc":
				workout_counts_to_return.sort(function(left, right) {
					return left.count == right.count ? 0 : left.count > right.count ? 1 : -1;
				});
				break;
			case "count_desc":
				workout_counts_to_return.sort(function(left, right) {
					return left.count == right.count ? 0 : left.count < right.count ? 1 : -1;
				});
				break;
			default:
				this.debug("Invalid workout_count_sort_order.  Applying default sort order.");
				workout_counts_to_return.sort(function(left, right) {
					return left.name == right.name ? 0 : left.name > right.name ? 1 : -1;
				});
		}

		return workout_counts_to_return;
	},

	addTemplateFilters: function() {
		this.nunjucksEnvironment().addFilter(
			"timeSinceNow",
			function (date) {
				date = moment(date);

				return date.fromNow();
			}.bind(this)
		);

		this.nunjucksEnvironment().addFilter(
			"moment",
			function (date) {
				date = moment(date);

				return date;
			}.bind(this)
		);

		this.nunjucksEnvironment().addFilter(
			"format",
			function (moment, format) {
				return moment.format(format);
			}.bind(this)
		);
	}
});