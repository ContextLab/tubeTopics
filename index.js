var fs = require('fs')
var path = require('path')
var ytdl = require('ytdl-core');
var ffmpeg = require('fluent-ffmpeg');
var temp = require("temp").track();
var async = require('async');
var math = require('mathjs')
var google = require('googleapis');
var speech = google.speech('v1beta1').speech;

var tubeTopics = function() {

    ////////////////////////////////////////////////////////////////////////////
    // VARIABLES ///////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    // loads in when the package is initialized
    model = loadModel()

    ////////////////////////////////////////////////////////////////////////////
    // PUBLIC FUNCTIONS ////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    // function to get topic weights from a youtube url
    function getTopicWeightsFromURL(url) {
        return new Promise((resolve, reject) => {
            downloadAudio(url).then((audioFilePath) => {
                getAudioSegmentParams(audioFilePath).then((segmentParams) => {
                    getTopics(segmentParams).then((result) => {
                        resolve(result)
                    })
                })
            })
        })
    };

    ////////////////////////////////////////////////////////////////////////////
    // PRIVATE FUNCTIONS ///////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    // function getTopicsForSegments(audioSegmentParams) {
    //   return new Promise((resolve, reject) => {
    //
    //   })
    // }

    ////////////////////////////////////////////////////////////////////////////
    // DOWNLOAD AUDIO CODE /////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    // function to download audio from a youtube link
    function downloadAudio(url) {
        return new Promise(function(resolve, reject) {
            var audioOutputPath = path.resolve(__dirname, 'sound.mp4');
            console.log('Downloading video and filtering the audio...')
            ytdl(url, {
                    filter: function(f) {
                        return f.container === 'mp4' && !f.encoding;
                    }
                })
                .pipe(fs.createWriteStream(audioOutputPath))
                .on('finish', function() {
                    console.log('Download finished.')
                    file = audioOutputPath;
                    resolve(audioOutputPath)
                })
        })
    };

    ////////////////////////////////////////////////////////////////////////////
    // PROCESS AUDIO CODE //////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    function getAudioSegmentParams(file) {
        console.log('Getting audio segment params...')
        return new Promise(function(resolve, reject) {
            ffmpeg.ffprobe(file, function(err, info) {
                var audioSegments = []
                var totalDuration = info.format.duration;
                var segments = false
                maxDuration = 15
                if (segments) {
                    for (var i = 0; i < segments.length; i++) {
                        var duration = (i == segments.length - 1) ? totalDuration - segments[i] : segments[i + 1] - segments[i];
                        if (duration < 0) {
                            callback(new Error("segments must be a sorted array of start times, \
        each less than the total length of your audio"));
                        }
                        var curStart = segments[i];
                        while (duration > maxDuration + .001) {
                            audioSegments.push({
                                'start': curStart,
                                'duration': maxDuration
                            });
                            duration -= maxDuration;
                            curStart += maxDuration;
                        }
                        audioSegments.push({
                            'start': curStart,
                            'duration': duration
                        });
                    }
                } else {
                    var numSegments = Math.ceil(totalDuration / maxDuration);
                    for (var i = 0; i < numSegments; i++) {
                        audioSegments.push({
                            'start': maxDuration * i,
                            'duration': maxDuration
                        });
                    }
                }
                console.log('Returning audio segment params')
                resolve(audioSegments)
            })
        })
    };

    function processSegment(data, callback) {
        console.log('Processing segment: ', data.start)
        console.log(file)
            /*
             * Processes a segment of audio from file by using ffmpeg to convert
             * a segment of specified start time and duration, save it as a temporary .flac file
             * and send it to getTranscriptFromServer
             */

            var start = data.start;
            var dur = data.duration;
            var tmpFile = temp.path({
                suffix: '.flac'
            });

            // Convert segment of audio file into .flac file
            ffmpeg()
                .on('error', function(err) {
                    onfinish(err);
                })
                .on('end', function() {
                    console.log('Finished processing: ', data.start)
                    console.log('Getting transcript')
                    getTranscript(tmpFile).then((transcript) => {
                        computeTopicWeights(transcript, model).then((topicWeights) => {
                            callback(null,{'weights': topicWeights,
                                           'start': start,
                                           'dur': dur
                            })
                        })
                    })
                })
                .input(file)
                .setStartTime(start)
                .duration(dur)
                .output(tmpFile)
                .audioFrequency(16000)
                .toFormat('flac')
                .run();
    }

    function getTopics(audioSegments) {
        console.log('Getting topics...')
        return new Promise(function(resolve, reject) {
            var limitConcurrent = 20
            async.mapLimit(audioSegments, limitConcurrent, processSegment, function(err, results) {
                // After all transcripts have been returned, process them
                if (err)
                    callback(err);
                var timedTopics = results.sort(function(a, b) {
                    if (a.start < b.start) return -1;
                    if (a.start > b.start) return 1;
                    return 0;
                });
                resolve(timedTopics)
            });
        })
    };

    // function to segment and process audio in preparation to send to google for decoding
    // function segmentAndProcessAudio(inputFile) {
    //     console.log('Processing audio...')
    //     return new Promise(function(resolve, reject) {
    //         ffmpeg()
    //             .input(inputFile)
    //             .seekInput(30)
    //             .format('flac')
    //             .audioFrequency(16000)
    //             .duration(30)
    //             .audioChannels(1)
    //             .save(inputFile + '.flac')
    //             .on('end', function() {
    //                 console.log('Done processing audio.')
    //                 resolve(inputFile + '.flac')
    //             })
    //     })
    // };

    ////////////////////////////////////////////////////////////////////////////
    // TOPIC MODEL CODE ////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    // load in the topic model

    function loadModel(modelPath) {
        console.log('Loading in topic model...')
        var modelPath = modelPath || 'model/topicModelDict.json';
        return new Promise(function(resolve, reject) {
            fs.readFile(modelPath, 'utf8', function(err, data) {
                if (err) throw err;
                model = JSON.parse(data);
                console.log('Model loaded successfully...')
                resolve(model)
            })
        })
    };

    // compute weights for the transcript

    function computeTopicWeights(words, model) {
        console.log("Computing topic weights...")
        return new Promise(function(resolve, reject) {
            var topicsByWords = words.map(function(word) {
                    return model[word]
                })
                .filter(function(model) {
                    return typeof model != 'undefined'
                })

            // code for log sum exp
            var topicsByWordsMtx = math.transpose(math.matrix(topicsByWords))
            var a = topicsByWordsMtx['_data'].map(function(topic) {
                return math.max(topic)
            })
            var topicVec = topicsByWordsMtx['_data'].map(function(topic, topicIndex) {
                    return topic.map(function(weight) {
                            return math.exp(weight - a[topicIndex])
                        })
                        .reduce(function(b, c) {
                            return b + c
                        })
                })
                .map(function(sums, idx) {
                    return (math.exp(a[idx] + math.log(sums)) / topicsByWordsMtx['_data'].length).toFixed(5)
                })
            resolve(topicVec)
        })
    }

    ////////////////////////////////////////////////////////////////////////////
    // GOOGLE SPEECH CODE //////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    function getTranscript(inputFile, callback) {
        return new Promise(function(resolve, reject) {
            var requestPayload;
            async.waterfall([
                function(cb) {
                    prepareRequest(inputFile, cb);
                },
                function(payload, cb) {
                    requestPayload = payload;
                    getAuthClient(cb);
                },
                function sendRequest(authClient, cb) {
                    console.log('Analyzing speech...');
                    speech.syncrecognize({
                        auth: authClient,
                        resource: requestPayload
                    }, function(err, result) {
                        if (err) {
                            return cb(err);
                        }
                        console.log('result:', JSON.stringify(result, null, 2));
                        console.log(JSON.stringify(result, null, 2))
                        words = [];
                        if (JSON.stringify(result, null, 2) != '{}') {
                            result.results.forEach(segment => {
                                segment.alternatives[0].transcript.trim().split(" ").forEach(word => {
                                    if (word != "") {
                                        words.push(word.toUpperCase())
                                    }
                                })
                            })
                        }

                        fs.writeFile(inputFile + ".txt", words, function(err) {
                            if (err) {
                                return console.log(err);
                            }
                            resolve(words)
                            console.log("The file was saved!");
                        });

                        cb(null, result);
                    });
                }
            ], callback);
        })
    };

    function getAuthClient(callback) {
        google.auth.getApplicationDefault(function(err, authClient) {
            if (err) {
                return callback(err);
            }
            if (authClient.createScopedRequired && authClient.createScopedRequired()) {
                authClient = authClient.createScoped([
                    'https://www.googleapis.com/auth/cloud-platform'
                ]);
            }

            return callback(null, authClient);
        });
    }

    function prepareRequest(inputFile, callback) {
        fs.readFile(inputFile, function(err, audioFile) {
            if (err) {
                return callback(err);
            }
            var encoded = new Buffer(audioFile).toString('base64');
            var payload = {
                config: {
                    encoding: 'FLAC',
                    sampleRate: 16000
                },
                audio: {
                    content: encoded
                }
            };
            return callback(null, payload);
        })
    };

    ////////////////////////////////////////////////////////////////////////////
    // END USER API  ///////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    return {
        getTopicWeightsFromURL: getTopicWeightsFromURL,
        getAudioSegmentParams: getAudioSegmentParams,
    }
}

module.exports = new tubeTopics();
