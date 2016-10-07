var fs = require('fs')
var path = require('path')
var ytdl = require('ytdl-core');
var ffmpeg = require('fluent-ffmpeg');
var async = require('async');
var math = require('mathjs')
var google = require('googleapis');
var speech = google.speech('v1beta1').speech;

var tubeTopics = function() {

    ////////////////////////////////////////////////////////////////////////////
    // VARIABLES ///////////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    // loads in when the package is initialized
    var model = loadModel()

    ////////////////////////////////////////////////////////////////////////////
    // PUBLIC FUNCTIONS ////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    // function to get topic weights from a youtube url
    function getTopicWeightsFromURL(url) {
        return new Promise((resolve, reject) => {
            downloadAudio(url).then((audio) => {
                segmentAndProcessAudio(audio).then((processedAudio) => {
                    getTranscripts(processedAudio).then((transcripts) => {
                        computeTopicWeights(transcripts, model).then((result) => {
                            resolve(result)
                        })
                    })
                })
            })
        })
    };

    ////////////////////////////////////////////////////////////////////////////
    // PRIVATE FUNCTIONS ///////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    ////////////////////////////////////////////////////////////////////////////
    // DOWNLOAD AUDIO CODE /////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    // function to download audio from a youtube link
    function downloadAudio(url) {
        return new Promise(function(resolve, reject) {
            var audioOutput = path.resolve(__dirname, 'sound.mp4');
            console.log('Downloading video and filtering the audio...')
            ytdl(url, {
                    filter: function(f) {
                        return f.container === 'mp4' && !f.encoding;
                    }
                })
                .pipe(fs.createWriteStream(audioOutput))
                .on('finish', function() {
                    console.log('Download finished.')
                    resolve(audioOutput)
                })
        })
    };

    // function to segment and process audio in preparation to send to google for decoding
    function segmentAndProcessAudio(inputFile) {
        console.log('Processing audio...', inputFile)
        return new Promise(function(resolve, reject) {
            ffmpeg()
                .input(inputFile)
                .seekInput(30)
                .format('flac')
                .audioFrequency(16000)
                .duration(30)
                .audioChannels(1)
                .save(inputFile + '.flac')
                .on('end', function() {
                    // fs.readFile(inputFile + '.flac', function(err, audioFile) {
                    //     if (err) {
                    //         return callback(err);
                    //     }
                        console.log('Done processing audio.')
                        resolve(inputFile + '.flac')
                    // })
                })
        })
    };

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
                    return math.exp(a[idx] + math.log(sums)) / topicsByWordsMtx['_data'].length
                })
            resolve(topicVec)
        })
    }

    ////////////////////////////////////////////////////////////////////////////
    // GOOGLE SPEECH CODE //////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    function getTranscripts(inputFile, callback) {
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
                    console.log('Got audio file!');
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
    }
}

module.exports = new tubeTopics();
