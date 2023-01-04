const jsr = require('jasmine-spec-reporter');

jasmine.getEnv().clearReporters();
jasmine.getEnv().addReporter(
	new jsr.SpecReporter({
		spec: {
			displayPending: true,
			displayStacktrace: jsr.StacktraceOption.RAW
		}
	})
);
