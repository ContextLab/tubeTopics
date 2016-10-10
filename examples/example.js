var tubeTopics = require('../index.js');

tubeTopics.getTopicWeightsFromURL('https://www.youtube.com/watch?v=kpCJyQ2usJ4&list=PL1847B1B2268562C7').then(function(result){
  console.log(result)
})

// tubeTopics.getAudioSegmentParams('/Applications/packages/tubeTopics/sound.mp4').then((segments)=>{
//   console.log(segments)
// })

// https://www.youtube.com/watch?v=Xt5dRmr8bCw
// https://www.youtube.com/watch?v=kpCJyQ2usJ4&list=PL1847B1B2268562C7
