fs = require('fs')
audioProcessor = require('./js/processAudio.js')
topicModel = require('./js/topicModel.js')
youtube = require('./js/youtube.js')

var tubeTopics = function() {

    // default settings
    var params = {};
    params.segLength = 15;
    params.modelLocation = 'model/topicModelDict.json';
    params.model = topicModel.loadModel(params.modelLocation);

    ////////////////////////////////////////////////////////////////////////////
    // PUBLIC FUNCTIONS ////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    function setParams(vals) {
        for (val in vals) {
            params[val] = vals[val]
        }
        if ('modelLocation' in vals){
          params.model = topicModel.loadModel(vals['modelLocation']);
          console.log('Loaded in custom model at: ', params.modelLocation)
        }
    };

    // function to get topic weights from a youtube url
    function getTopicWeightsFromURL(url) {
        return new Promise((resolve, reject) => {
            youtube.checkForTranscriptOnYoutube(url).then(result => {
                if (result == null) {
                    console.log('Transcript not available on Youtube.  Sending to Google Speech...')
                    getSegmentsViaGoogleSpeech(url).then(segments => {
                        topicModel.getTopics(segments, params.model).then(result => {
                            resolve(result)
                        })
                    })
                } else {
                    console.log('Transcript found on Youtube.  Retrieving it...')
                    getSegmentsViaYoutube(result, url).then(segments => {
                        topicModel.getTopics(segments, params.model).then(result => {
                            resolve(result)
                        })
                    })
                }
            })
        })
    };

    ////////////////////////////////////////////////////////////////////////////
    // PRIVATE FUNCTIONS ///////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    function getSegmentsViaGoogleSpeech(url) {
        return new Promise((resolve, reject) => {
            audioProcessor.downloadAudio(url).then((audioFilePath) => {
                audioProcessor.getAudioSegmentParams(audioFilePath, params.segLength).then((segmentParams) => {
                    audioProcessor.decodeSpeech(segmentParams).then((result) => {
                        resolve(result)
                    })
                })
            })
        })
    };

    function getSegmentsViaYoutube(result, url) {
        return new Promise((resolve, reject) => {
            youtube.getYoutubeTranscript(result).then(transcript => {
                if (transcript.slice(0, 3) == 'The') {
                    console.log("You don't have the right permissions to download this file.  Reverting back to Google Speech...")
                    getSegmentsViaGoogleSpeech(url).then(segments => {
                        resolve(segments)
                    })
                } else {
                    var segments = youtube.parseYoutubeTranscript(transcript, params.segLength)
                    resolve(segments)
                }
            })
        })
    }

    ////////////////////////////////////////////////////////////////////////////
    // END USER API  ///////////////////////////////////////////////////////////
    ////////////////////////////////////////////////////////////////////////////

    return {
        setParams: setParams,
        getTopicWeightsFromURL: getTopicWeightsFromURL,
    }
}

module.exports = new tubeTopics();
