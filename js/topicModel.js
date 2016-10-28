var fs = require('fs')
var math = require('mathjs')

module.exports = {

    loadModel: function(modelPath) {
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
    },

    // load in the top words

    loadTopWords: function(modelPath) {
        console.log('Loading in top words...')
        var topWordsPath = topWordsPath || 'model/topWords.json';
        return new Promise(function(resolve, reject) {
            fs.readFile(modelPath, 'utf8', function(err, data) {
                if (err) throw err;
                topWords = JSON.parse(data);
                console.log('Model loaded successfully...')
                resolve(topWords)
            })
        })
    },

    getTopics: function(segments, model) {
        return new Promise((resolve, reject) => {
            Promise.all(segments.map(segment => {
                return computeTopicWeights(segment.text, model, {
                    dur: segment.dur,
                    start: segment.start
                })
            })).then(result => {
                resolve(result)
            })
        })
    }
};

// private functions

function computeTopicWeights(words, model, params) {
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
            transcript: words,
            params: params
        })
    })
}
