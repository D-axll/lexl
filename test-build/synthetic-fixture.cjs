'use strict';
// Deliberately invented names/results; never derived from a user's export.
module.exports=function syntheticFixture(){
 const exercises=[
  {id:'test-x-a',name:'TEST – Övning Alfa',sets:3,reps:'10',weight:'5',note:'Syntetisk övning. Registrera endast påhittade värden.',circleGroup:'A'},
  {id:'test-x-b',name:'TEST – Övning Beta',sets:3,reps:'8',weight:'7.5',note:'Syntetisk cirkelövning.',circleGroup:'A'},
  {id:'test-x-c',name:'TEST – Övning Gamma',sets:2,reps:'12',weight:'2',note:'Syntetisk fristående övning.',circleGroup:''}
 ];
 const program={id:'test-program',name:'TEST – Syntetiskt cirkelprogram',type:'cirkel',rounds:3,pages:[],exercises};
 const history=Array.from({length:5},(_,i)=>({id:program.id,name:program.name,date:`2026-01-0${i+1}T10:00:00Z`,workoutDate:`2026-01-0${i+1}`,workoutClock:'10:00',timeKnown:true,totalMinutes:20+i,warmupMinutes:3,warmup:[{activity:'TEST – Syntetisk uppvärmning',minutes:3,seconds:0}],comments:{'test-x-a':`TEST – Påhittad passanteckning ${i+1}`},circleGroups:{'test-x-a':'A','test-x-b':'A'},rows:exercises.flatMap(e=>Array.from({length:e.sets},(_,j)=>({id:e.id,name:e.name,set:j+1,weight:String(5+i),reps:'10',done:true,target:e.reps,note:'TEST – Syntetiskt set'})))}));
 return {programs:[program],history,draft:{id:program.id,name:'FELTEST – Syntetiskt pågående pass',started:'2026-01-06T10:00:00Z',rows:[{id:'test-x-a',name:'TEST – Övning Alfa',set:1,weight:'6.5',reps:'9',done:true},{id:'test-x-b',name:'TEST – Övning Beta',set:1,weight:'8',reps:'7',done:false}],warmup:[{activity:'TEST – Syntetisk uppvärmning',minutes:'2',seconds:'15'}],comments:{'test-x-a':'FELTEST – Påhittad utkastanteckning'},circleGroups:{'test-x-a':'A','test-x-b':'A'}},lexlWarmTimeVersion:1};
};
