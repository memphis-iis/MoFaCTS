// Debug script for Radicals TDF dashboard issue
// Run this in your browser console when logged in as a user who has done the Radicals TDF



// 1. Find the Radicals TDF
const radicalsTdf = Tdfs.findOne({'content.tdfs.tutor.setspec.lessonname': /Radical/i});
if (!radicalsTdf) {
  console.error("❌ Could not find Radicals TDF");
} else {
  
  
  
  
  
  
  
  
  

  const TDFId = radicalsTdf._id;

  // 2. Check ALL history for this TDF
  
  const allHistory = Histories.find({TDFId: TDFId}).fetch();
  

  if (allHistory.length > 0) {
    // Group by levelUnitType
    const byType = {};
    allHistory.forEach(h => {
      const type = h.levelUnitType || 'undefined';
      byType[type] = (byType[type] || 0) + 1;
    });

    
    Object.keys(byType).forEach(type => {
      
    });

    // Show unit info
    
    const unitNames = [...new Set(allHistory.map(h => h.levelUnitName))];
    unitNames.forEach(name => {
      const count = allHistory.filter(h => h.levelUnitName === name).length;
      const type = allHistory.find(h => h.levelUnitName === name)?.levelUnitType;
      
    });

    // Sample record
    
    
  } else {
    
  }

  // 3. Check 'model' type history specifically
  
  const modelHistory = Histories.find({
    TDFId: TDFId,
    levelUnitType: 'model'
  }).fetch();
  

  if (modelHistory.length === 0) {
    
    
    
    
    
  } else {
    
  }

  // 4. Check dashboard cache
  
  const cache = UserDashboardCache.findOne({userId: Meteor.userId()});
  if (!cache) {
    
    
  } else {
    
    
    

    if (cache.tdfStats && cache.tdfStats[TDFId]) {
      
      
    } else {
      
      
    }
  }

  // 5. Check if TDF should be visible on dashboard
  
  const setspec = radicalsTdf.content?.tdfs?.tutor?.setspec;
  const isAdmin = Meteor.user()?.roles?.includes('admin');
  const isTeacher = Meteor.user()?.roles?.includes('teacher');
  const hasExperimentTarget = setspec?.experimentTarget && setspec.experimentTarget !== '';
  const userselect = setspec?.userselect === 'true';

  
  
  
  

  const shouldShow = userselect || (hasExperimentTarget && (isTeacher || isAdmin));
  

  if (!shouldShow) {
    
    if (!userselect) {
      
    }
    if (hasExperimentTarget && !isTeacher && !isAdmin) {
      
    }
  }
}


