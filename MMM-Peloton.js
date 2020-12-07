Module.register("MMM-Peloton", {
	defaults: {
		//timers
		refresh_every: 300,                                            //number of seconds between data refreshes

		//authentication
		username: "",
		password: "",

		display_type: "workout_count",                                 //supported values are: workout_count, recent_workouts, and challenges

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
		this.sign_in_error = false;
		this.peloton_challenges = null;
		
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

	/**
	 * Returns an array of the css files that should be included
	 * for the Peloton widgets.
	 *
	 * @return array
	 */
    getStyles: function() {
    	return ["font-awesome.css", "MMM-Peloton.css"];
    },

	/**
	 * Returns an array of the js files that should be included
	 * for the Peloton widgets.
	 *
	 * @return array
	 */
    getScripts: function () {
		return ["moment.js"];
	},

	/**
	 * Returns the name of the template that this widget should load.
	 *
	 * Be default it will load a template with the same name as the
	 * display_type config.  If a display_type is set that does not
	 * match a template file then undefined_display_type.njk will be
	 * returned to allow the front end to represent the misconfiguration.
	 *
	 * @return string
	 */
	getTemplate: function () {
		let template_name = null;

		switch (this.config.display_type) {
			case "workout_count":
			case "recent_workouts":
			case "challenges":
				template_name = this.config.display_type + ".njk";
				break;
			default:
				template_name = "undefined_display_type.njk";
				break;
		}

		return template_name;
	},

	/**
	 * Sets the data to be used by our template.
	 *
	 * This will set the minimum amount of data necessary for
	 * the template based on the display_type that is configured.
	 *
	 * @return object
	 */
	getTemplateData: function () {
		let data = {};

		data.peloton_user = this.peloton_user;
		data.sign_in_error = this.sign_in_error;

		switch (this.config.display_type) {
			case "workout_count":
				data.workout_counts = this.getWorkoutCounts();
				break;
			case "recent_workouts":
				data.recent_workouts = this.getRecentWorkouts();
				break;
			case "challenges":
				data.challenges = this.getChallenges();
				break;
		}
		
		return data;
	},

	/**
	 * Kicks off a request to get user data.
	 *
	 * This function only knows how to let the backend know
	 * to kick off a request to the Peloton API.  Therefore,
	 * this function doesn't return anything and we have to
	 * rely on socketNotificationReceived to capture the
	 * data about the user.
	 *
	 * @return void
	 */
	requestUserData: function() {
		this.debug("Requesting user data");

		this.sendSocketNotification(this.normalizeNotification("REQUEST_USER"), {
			instance_identifier: this.identifier
		});
	},

	/**
	 * Kicks off a request to get recent workouts for the user.
	 *
	 * This function only knows how to let the backend know
	 * to kick off a request to the Peloton API.  Therefore,
	 * this function doesn't return anything and we have to
	 * rely on socketNotificationReceived to capture the
	 * workouts for the user.
	 *
	 * @return void
	 */
	requestRecentWorkouts: function() {
		this.debug("Requesting recent workout data");

		this.sendSocketNotification(this.normalizeNotification("REQUEST_RECENT_WORKOUTS"), {
			instance_identifier: this.identifier
		});
	},

	/**
	 * Kicks off a request to get challenges for the user.
	 *
	 * This function only knows how to let the backend know
	 * to kick off a request to the Peloton API.  Therefore,
	 * this function doesn't return anything and we have to
	 * rely on socketNotificationReceived to capture the
	 * workouts for the user.
	 *
	 * @return void
	 */
	requestChallenges: function() {
		this.debug("Requesting challenges");

		this.sendSocketNotification(this.normalizeNotification("REQUEST_CHALLENGES"), {
			instance_identifier: this.identifier
		});
	},

	/**
	 * This will transform the raw Peloton API data for
	 * recent workouts and will return the transformed
	 * data as an array.
	 *
	 * This will return an empty array if the raw data
	 * hasn't been fetched.
	 *
	 * This will limit the recent workouts based on the
	 * recent_workouts_limit configuration.
	 *
	 * @return array
	 */
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

	/**
	 * This will transform the raw Peloton API data for
	 * challenges and will return the transformed data
	 * as an array.
	 *
	 * This will return an empty array if the raw data
	 * hasn't been fetched.
	 *
	 * @return array
	 */
	getChallenges: function() {
		this.debug("Transforming challenges");

		let challenges = [];

		if (this.peloton_challenges) {
			challenges = this.peloton_challenges.challenges;
		}

		return challenges;
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
	 * Wrapper function to kick off the appropriate backend requests.
	 *
	 * This uses the display_type configuration to determine which
	 * requests should be kicked off.
	 *
	 * @return void
	 */
	refreshData: function() {
		//get new user data every time
		this.requestUserData();

		//refresh data based on what we are displaying
		switch(this.config.display_type) {
			case "recent_workouts":
				this.requestRecentWorkouts();
				break;
			case "challenges":
				this.requestChallenges();
				break;
		}
	},

	/**
	 * Helper function to set the sign_in_error member variable.
	 *
	 * @param boolean sign_in_error
	 *
	 * @return void
	 */
	setSignInError: function(sign_in_error) {
		this.sign_in_error = !!sign_in_error;
	},

	socketNotificationReceived: function (notification, payload) {
		let self = this;
		if (payload.instance_identifier == this.identifier) {
			if (notification === "USER_IS_LOGGED_IN") {
				this.debug("Front end knows that user is logged in");

				this.refreshData();

				//set up timer to refresh data
				setInterval(function () {
					self.refreshData();
				}, this.config.refresh_every * 1000);
			} else if (notification === "FAILED_TO_LOG_IN") {
				this.debug("Front end knows that user was not able to log in");

				this.setSignInError(true);
				this.updateDom();
			} else if (notification === "RETRIEVED_USER_DATA") {
				this.debug("Front end knows that user data was retrieved");
				this.peloton_user = payload.peloton_user;
				this.updateDom();
			} else if (notification === "RETRIEVED_RECENT_WORKOUT_DATA") {
				this.debug("Front end retrieved recent workout data");
				this.peloton_recent_workouts = payload.body;
				this.updateDom();
			} else if (notification === "RETRIEVED_CHALLENGE_DATA") {
				this.debug("Front end retrieved challenge data");
				this.peloton_challenges = payload.body;
				this.updateDom();
			}
		}
	},

	debug: function(stringToLog) {
		if (this.config.debug) {
			Log.log("[" + this.name + ":" + this.identifier + "] " + stringToLog);
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