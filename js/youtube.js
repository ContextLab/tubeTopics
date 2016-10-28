////////////////////////////////////////////////////////////////////////////
// YOUTUBE CODE  ///////////////////////////////////////////////////////////
////////////////////////////////////////////////////////////////////////////
var google = require('googleapis');
var speech = google.speech('v1beta1').speech;

module.exports = {

    checkForTranscriptOnYoutube: function(url) {
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
                        resolve(data)
                    } else {
                        resolve(null)
                    }
                })
            })
        })
    },

    getYoutubeTranscript: function(captionIdList) {
        return new Promise((resolve, reject) => {
            getYoutubeAuthClient().then((authClient) => {
                var youtube = google.youtube({
                    version: 'v3',
                    auth: authClient
                });
                var transcript = captionIdList.items.filter((transcript) => {
                    return transcript.snippet.language == 'en'
                })[0]
                var transcriptId = transcript.id;
                var transcriptTrackKind = transcript.snippet.trackKind;

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
    },

    parseYoutubeTranscript: function(data) {
        if (data[0] == 1) {
            var parsedObjects = parseType1(data);
        } else {
            var parsedObjects = parseType2(data);
        }
        return resliceTranscript(parsedObjects, 15)
    }
};

// private functions

function resliceTranscript(parsedObjects, seglen) {
    var lastTimePoint = parsedObjects[parsedObjects.length - 1].time[1]
    var segments = Array.apply(null, Array(Math.ceil(lastTimePoint / seglen) + 1)).map(function(_, i) {
        return i * seglen;
    });

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
            return (item.time[0] >= segment.start && item.time[1] <= segment.start + segment.dur) || (item.time[0] >= segment.start && item.time[1] - (segment.start + segment.dur) <= (item.time[1] - item.time[0]) / 2)
        });

        inRangeObjects.forEach(item => {
            segment.text = segment.text.concat(item.text.join(' '))
        });
        segment.text = segment.text.join(' ').split(' ').map(word => {
            return word.toUpperCase()
        })
    });
    return reslicedSegments
};

function parseType1(data) {
    var parsedTranscript = []
    data.split('\n').forEach((item, idx, array) => {
            if (isInt(item)) {
                snippet = {}
                snippet.id = item
                snippet.time = parseTime1(array[idx + 1])
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
        // console.log(parsedTranscript)
    return parsedTranscript

    function parseTime1(date) {
        var splitDate = date.split(' --> ')
        var start = toSeconds1(splitDate[0])
        var end = toSeconds1(splitDate[1])
        return [start, end]
    };

    function toSeconds1(datestr) {
        var datespl = datestr.split(':')
        var hourToSec = parseInt(datespl[0]) * 3600
        var minToSec = parseInt(datespl[1]) * 60
        var seconds = datespl[2].split(',')[0]
        return parseInt(hourToSec) + parseInt(minToSec) + parseInt(seconds)
    };

};

function parseType2(data) {
    parsedTranscript = []
    var splitData = data.split('\n')
    for (var idx = 0; idx < splitData.length - 1; idx++) {
        if (splitData[idx].match('0:')) {
            parsedTranscript.push({
                id: idx.toString(),
                time: parseTime2(splitData[idx]),
                text: [splitData[idx + 1]]
            })
        }
    }
    return parsedTranscript

    function parseTime2(date) {
        var splitDate = date.split(',')
        var start = toSeconds2(splitDate[0])
        var end = toSeconds2(splitDate[1])
        return [start, end]
    };

    function toSeconds2(datestr) {
        var datespl = datestr.split(':')
        var hourToSec = parseInt(datespl[0]) * 3600
        var minToSec = parseInt(datespl[1]) * 60
        var seconds = datespl[2].split('.')[0]
        return parseInt(hourToSec) + parseInt(minToSec) + parseInt(seconds)
    };
};

function isInt(value) {
    return !isNaN(value) &&
        parseInt(Number(value)) == value &&
        !isNaN(parseInt(value, 10));
};

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
