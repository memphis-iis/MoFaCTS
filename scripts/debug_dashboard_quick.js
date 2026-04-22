// Quick debug for dashboard issue


// Check cache
const cache = UserDashboardCache.findOne({userId: Meteor.userId()});

if (cache) {
  
  
}

// Find Radicals TDF
const radicalsTdf = Tdfs.findOne({'content.tdfs.tutor.setspec.lessonname': /Radical/i});
if (radicalsTdf) {
  const TDFId = radicalsTdf._id;
  
  

  // Check history directly
  const modelHistory = Histories.find({
    userId: Meteor.userId(),
    TDFId: TDFId,
    levelUnitType: 'model'
  }).count();
  

  if (modelHistory > 0 && (!cache || !cache.tdfStats || !cache.tdfStats[TDFId])) {
    
    
  }

  // Check visibility conditions
  
  
  
  

  // Check if in courseTdfs
  const user = Meteor.user();
  const courseId = user?.loginParams?.curClass?.courseId;
  
  if (courseId) {
    const courseTdfs = Assignments.find({courseId: courseId}).fetch();
    
    const isAssigned = courseTdfs.filter(e => e.TDFId === TDFId).length > 0;
    
  }
}
