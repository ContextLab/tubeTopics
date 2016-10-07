var fs = require('fs')
var path = require('path')
var ytdl = require('ytdl-core');
var ffmpeg = require('fluent-ffmpeg');
var async = require('async');
var math = require('mathjs')
var google = require('googleapis');
var speech = google.speech('v1beta1').speech;

var tubeTopics = function() {

    function loadModel() {
        return new Promise(function(resolve, reject) {
            fs.readFile('model/topicModelDict.json', 'utf8', function(err, data) {
                if (err) throw err;
                model = JSON.parse(data);
                console.log('Using default model...')
                resolve(model)
            })
        })
    };
    var model = loadModel()

    function getTranscript(url) {
        return new Promise(function(resolve, reject) {
            var audioOutput = path.resolve(__dirname, 'sound.mp4');
            var videoTranscripts = []
            console.log('Downloading video...')
            ytdl(url, {
                    filter: function(f) {
                        return f.container === 'mp4' && !f.encoding;
                    }
                })
                .pipe(fs.createWriteStream(audioOutput))
                .on('finish', function() {
                    console.log('Finished downloading. Decoding transcript...')
                    recognize(audioOutput, console.log).then(function(transcript) {
                        resolve(transcript)
                    });

                })

        })
    };

    function getModelFromURL(url) {
        return new Promise(function(resolve, reject) {
            getTranscript(url).then(function(transcript) {
                computeTopicModel(transcript, model).then(function(result) {
                    resolve(result)
                })
            })
        })
    };

    function computeTopicModel(words, model) {
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
                    return math.exp(a[idx] + math.log(sums))/topicsByWordsMtx['_data'].length
                })
            resolve(topicVec)
        })
    }

    // GOOGLE SPEECH CODE

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

    function prepareRequest(inputFile, options, callback) {
        ffmpeg()
            .input(inputFile)
            .seekInput('1:00')
            .format('flac')
            .audioFrequency(16000)
            .duration('0:0:30.00')
            .audioChannels(1)
            .save(inputFile + '.flac')
            .on('end', function() {
                fs.readFile(inputFile + '.flac', function(err, audioFile) {
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
            })
    };

    function recognize(inputFile, callback) {
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

    // API/data for end-user
    return {
        getModelFromURL: getModelFromURL,
    }
}

module.exports = new tubeTopics();
