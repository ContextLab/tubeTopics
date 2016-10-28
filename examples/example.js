var fs = require('fs');
var tubeTopics = require('../index.js');

var params = {
  seglen: 30
}
tubeTopics.setParams(params);

var url = 'https://www.youtube.com/watch?v=A3F0gqETUhw'

tubeTopics.getTopicWeightsFromURL(url).then(function(result) {
    var jsonData = JSON.stringify(result);
    fs.writeFile("test.txt", jsonData, function(err) {
        if (err) {
            return console.log(err);
        }
    })
});
