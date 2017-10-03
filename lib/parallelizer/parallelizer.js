'use strict';
var cucumber_js = require('./../cucumber/cucumber_js');
var log = require('debug')('cucumber-parallel:parallelizer');
var Events = require('events');
var Tasks = require('./../tasker/tasks')();
var ChildProcess = require('child_process');
var Reporter = require('./reporter')();
var path = require('path');
var fs = require('fs');
var colors = require('colors');
var _ = require('lodash');

module.exports = function () {

    var cucumberProgram;
    var cucumberJs;
    var tasks;
    var _argv;
    var index = 0;
    var runnerIndex = 0;

    var PATH_TO_LIB_RUNNER = '/lib/parallelizer/runner';

    var eventEmitter = new Events.EventEmitter();

    eventEmitter.on('run', function () {
        forkRunner({feature: tasks.shift()});
        eventEmitter.emit('next');
    });

    eventEmitter.on('next', function () {
        if (tasks.length > 0) {
            eventEmitter.emit('run');
        }
    });

    eventEmitter.on('invoke', function () {
        eventEmitter.emit('initialize');
    });

    eventEmitter.on('report', function (message) {
        Reporter.inform(message);
    });

    eventEmitter.on('initialize', function () {
        log('_argv: ', _argv);

        cucumberProgram = cucumberJs.getProgram();
        cucumberProgram.parse(_argv);

        log('options: ', cucumberProgram.opts());
        log('args: ', cucumberProgram.args);

        tasks = Tasks.getTasks(cucumberProgram.args, cucumberProgram.opts());

        eventEmitter.emit('run');
    });

    function exit() {
        if (Reporter.getResults().succeeded) {
            console.log(Reporter.CUCUMBER_PARALLEL + 'Done, all scenarios passed without error'.bold.green);
        } else {
            console.log(Reporter.CUCUMBER_PARALLEL + 'Failed scenarios, please see the report'.bold.red);
        }
        process.exit(Reporter.getResults().code);
    }

    function done() {
        function exitDone() {
            exit();
        }

        if (runnerIndex === 0) {
            Reporter.report(Tasks.getParallelType())
                .then(exitDone);

        } else {
            Reporter.report(Tasks.getParallelType());
        }
    }

    function forkRunner(options) {
        var runner;
        //Changes to allow multiple feature files directories to be run in parallel ----------------------------------
        var pathToFeatures = cucumberJs.getProgram().args;

        //replace featurePath with threaded features
        //replace the first arg with the list of threaded features
        var argv_ = _.map(_argv, function(val) {
            return val === pathToFeatures[0] ? options.feature : val;
        });
        //remove any other feature paths in the new args list because we have already replaced them above
        argv_ = argv_.filter( function(val) {
            return pathToFeatures.indexOf(val) < 0 ;
        });
        //End of code changes ----------------------------------------------------------------------------------------
        if (options.feature.length > 0) {
            runnerIndex++;
            runner = ChildProcess.fork(path.join(__dirname, '../..' + PATH_TO_LIB_RUNNER), argv_);
        }

        log('starting runner ', ++index);

        runner.on('message', function (message) {

            log('message received. runner is', runnerIndex, 'and message is', message);

            if (message.info === 'report') {
                runnerIndex--;
                log('message receive for reporting. runner decremented and it is', runnerIndex);
                Reporter.inform(message);
                done();
            }

            if (message.info === 'formatter') {
                Reporter.formatterOutputFile(message);
            }
        });
    }

    function invoke(argv) {
        _argv = argv;
        cucumberJs = cucumber_js();
        eventEmitter.emit('invoke');
    }

    return {
        invoke: invoke
    }
};
