window.DEMO_SCRIPT=async({sleep,tap,scroll})=>{
  await sleep(1500);
  await tap('#sampleBtn',{after:2200});               // load example data
  await scroll(300); await scroll(-300);
  await tap('.appt.tap',{after:1800});                  // open the next appointment
  await tap('#chk',{after:1600});                       // finish & take payment
  await tap('#tipB button[data-p="0.20"]');             // 20% tip
  await tap('#mB .chip[data-m="Card"]');                // paid by card
  await tap('#doneP',{after:2000});                     // record payment
  await tap('nav [data-v="cal"], [data-v="cal"]',{after:2200});
  await tap('[data-v="clients"]',{after:1500});
  await tap('.client.tap',{after:2200});                // client notes & history
  await tap('#veil',{after:1200});
  await tap('[data-v="earn"]',{after:1800});
  await scroll(500,2000); await scroll(-500,1200);
  await tap('[data-v="today"]',{after:1500});
};
