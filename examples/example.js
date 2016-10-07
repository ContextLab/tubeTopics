var tubeTopics = require('../index.js');

tubeTopics.getModelFromURL('https://www.youtube.com/watch?v=kpCJyQ2usJ4&list=PL1847B1B2268562C7').then(function(result){
  console.log(result)
})
// https://www.youtube.com/watch?v=Xt5dRmr8bCw
// https://www.youtube.com/watch?v=kpCJyQ2usJ4&list=PL1847B1B2268562C7
