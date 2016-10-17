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
          checkForTranscriptOnYoutube(url).then(result => {
              if (result == null) {
                  downloadAudio(url).then((audioFilePath) => {
                      getAudioSegmentParams(audioFilePath).then((segmentParams) => {
                          getTopics(segmentParams).then((result) => {
                              resolve(result)
                          })
                      })
                  })
              } else {
                  getYoutubeTranscript(result).then(transcript => {
                      parseYoutubeTranscript(transcript)
                  })
              }
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
                    computeTopicWeights(transcript, model).then((results) => {
                        callback(null, {
                            'weights': results.weights,
                            'start': start,
                            'dur': dur,
                            'transcript': results.transcript
                        })
                    })
                })
            })
            .input(file)
            .setStartTime(start)
            .duration(dur)
            .output(tmpFile)
            .audioFrequency(16000)
            .audioChannels(1)
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
                // var ranks = timedTopics[0][weights].slice().map(function(v){ return sorted.indexOf(v)+1 });
                // var filteredRanks = ranks.filter
                resolve(timedTopics)
            });
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

    // load in the top words

    function loadTopWords(modelPath) {
        console.log('Loading in topic model...')
        var topWordsPath = topWordsPath || 'model/topWords.json';
        return new Promise(function(resolve, reject) {
            fs.readFile(modelPath, 'utf8', function(err, data) {
                if (err) throw err;
                topWords = JSON.parse(data);
                console.log('Model loaded successfully...')
                resolve(topWords)
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
                    return (math.exp(a[idx] + math.log(sums)) / topicsByWordsMtx['_data'].length).toFixed(8)
                })
            resolve({
                weights: topicVec,
                transcript: words
            })
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
                            console.log(err)
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

                        cb(null, words);
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
                    'https://www.googleapis.com/auth/cloud-platform',
                    'https://www.googleapis.com/auth/youtube.force-ssl'
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
    // YOUTUBE CODE  ///////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    function getYoutubeAuthClient() {
        return new Promise((resolve, reject) => {
            google.auth.getApplicationDefault(function(err, authClient) {
                if (err) {
                    return callback(err);
                }
                if (authClient.createScopedRequired && authClient.createScopedRequired()) {
                    authClient = authClient.createScoped([
                        'https://www.googleapis.com/auth/cloud-platform',
                        'https://www.googleapis.com/auth/youtube.force-ssl'
                    ]);
                }
                resolve(authClient);
            });
        })
    };

    function checkForTranscriptOnYoutube(url) {
        return new Promise((resolve, reject) => {
            getYoutubeAuthClient().then((authClient) => {

                var youtube = google.youtube({
                    version: 'v3',
                    auth: authClient
                });

                // check to see if captions exist
                youtube.captions.list({
                    videoId: url.split('=')[1],
                    part: ['snippet'],
                    q: 'Node.js on Google Cloud'
                }, function(err, data) {
                    if (err) {
                        console.error('Error: ' + err);
                    }
                    if (data) {
                        console.log("Found transcript on Youtube")
                        resolve(data)
                    } else {
                        resolve(null)
                    }
                })
            })
        })
    };

    // function prepareYoutubeRequest(captionIdList) {
    //     var transcriptId = captionIdList.items.filter((transcript) => {
    //         return transcript.snippet.language == 'en' && transcript.snippet.trackKind == 'standard'
    //     })[0].id
    //
    //     var payload = {
    //         id: transcriptId,
    //         tlang: 'en'
    //     }
    //     return payload
    // }

    function getYoutubeTranscript(captionIdList) {
        return new Promise((resolve, reject) => {
            getYoutubeAuthClient().then((authClient) => {
                var youtube = google.youtube({
                    version: 'v3',
                    auth: authClient
                });
                var transcriptId = captionIdList.items.filter((transcript) => {
                    return transcript.snippet.language == 'en' && transcript.snippet.trackKind == 'standard'
                })[0].id

                var payload = {
                    id: transcriptId,
                    tlang: 'en'
                }
                youtube.captions.download(payload, (err, data) => {
                    if (err) {
                        console.error('Error: ' + err);
                    }
                    if (data) {
                        resolve(data)
                    }
                })
            })
        })
    };

    function parseYoutubeTranscript(data) {

        var parsedObjects = parseToObjects(data);
        return resliceTranscript(parsedObjects, 15)

        // private FUNCTIONS
        function resliceTranscript(parsedObjects, seglen) {
            var lastTimePoint = parseTime(parsedObjects[parsedObjects.length-1].time)[1]
            var segments = Array.apply(null, Array(Math.ceil(lastTimePoint/seglen)+1)).map(function (_, i) {return i*seglen;});

            var reslicedSegments = segments.map((segment, idx) => {
                return {
                    start: segment,
                    dur: seglen,
                    text: []
                }
            });
            
            reslicedSegments.forEach((segment, idx) => {
                // if the segment falls within the resliced segment range or if the segment falls mostly within the resliced segment range
                var inRangeObjects = parsedObjects.filter(item => {
                    return (parseTime(item.time)[0] >= segment.start && parseTime(item.time)[1] <= segment.start + segment.dur) || (parseTime(item.time)[0] >= segment.start && parseTime(item.time)[1] - (segment.start + segment.dur) <= (parseTime(item.time)[1] - parseTime(item.time)[0]) / 2)
                });
                // console.log(inRangeObjects)

                inRangeObjects.forEach(item => {
                    segment.text = segment.text.concat(item.text.join(' '))
                });
                segment.text = segment.text.join(' ')
            });
            console.log(reslicedSegments)

            function parseTime(date) {
                var splitDate = date.split(' --> ')
                var start = toSeconds(splitDate[0])
                var end = toSeconds(splitDate[1])

                return [start, end]

                function toSeconds(datestr) {
                    var datespl = datestr.split(':')
                    var hourToSec = parseInt(datespl[0]) * 3600
                    var minToSec = parseInt(datespl[1]) * 60
                    var seconds = datespl[2].split(',')[0]
                    return parseInt(hourToSec) + parseInt(minToSec) + parseInt(seconds)
                }
            }

        }

        function parseToObjects(data) {
            var parsedTranscript = []
            data.split('\n').forEach((item, idx, array) => {
                if (isInt(item)) {
                    snippet = {}
                    snippet.id = item
                    snippet.time = array[idx + 1]
                    snippet.text = [];
                    counter = 2
                    while (!isInt(array[counter + idx]) && counter + idx <= array.length) {
                        snippet.text.push(array[counter + idx])
                        counter += 1
                        if (counter > 5) {
                            break
                        }
                    }
                    // console.log(snippet)
                    parsedTranscript.push(snippet)
                    counter = 2
                }
            })
            return parsedTranscript

            function isInt(value) {
                return !isNaN(value) &&
                    parseInt(Number(value)) == value &&
                    !isNaN(parseInt(value, 10));
            }
        };
    };

    ////////////////////////////////////////////////////////////////////////////
    // END USER API  ///////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    return {
        getTopicWeightsFromURL: getTopicWeightsFromURL,
        getAudioSegmentParams: getAudioSegmentParams,
        checkForTranscriptOnYoutube: checkForTranscriptOnYoutube,
        getYoutubeTranscript: getYoutubeTranscript,
        parseYoutubeTranscript: parseYoutubeTranscript,
    }
}

module.exports = new tubeTopics();
