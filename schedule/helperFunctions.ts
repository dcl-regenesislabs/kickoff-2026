export function splitTextIntoLines(
    text: string,
    maxLenght: number,
    maxLines?: number
  ) {
    let finalText: string = ''
    for (let i = 0; i < text.length; i++) {
      let lines = finalText.split('\n')
  
      if (lines[lines.length - 1].length >= maxLenght && i !== text.length) {
        if (finalText[finalText.length - 1] !== ' ') {
          if (maxLines && lines.length >= maxLines) {
            finalText = finalText.concat('...')
            return finalText
          } else {
            finalText = finalText.concat('-')
          }
        }
        finalText = finalText.concat('\n')
        if (text[i] === ' ') {
          continue
        }
      }
  
      finalText = finalText.concat(text[i])
    }
  
    return finalText
  }
  
  export function cleanString(input:string) {
    var output = "";
    for (var i=0; i<input.length; i++) {
        if (input.charCodeAt(i) <= 127 || input.charCodeAt(i) >= 160 && input.charCodeAt(i) <= 255) {
            output += input.charAt(i);
        }
    }
    return output;
  }
  
  // export const wrap = (s:string, w:number) => s.replace(
  //   new RegExp(`(?![^\\n]{1,${w}}$)([^\\n]{1,${w}})\\s`, 'g'), '$1\n'
  // );
  
  export function getTitleFontSize(string:string):number{
  
    if(string.length < 30){
      return 6
    }
  
    return 4
  }
  
  export function wordWrap(str:string, maxWidth:number, maxLines:number) {
    let newLineStr = "\n"
    let done = false 
    let res = ''
    let linesSeparate = str.split(newLineStr)
    let lines = ''
  
    //log("original lines: " + str.split(newLineStr).length)
    
    if(str.length > maxWidth){
      for( let j=0; j< linesSeparate.length; j++){
        res = ''
        done = false 
        //process each line for linebreaks
        while (linesSeparate[j].length > maxWidth) {  
         
          let found = false;
          // Inserts new line at first whitespace of the line
          for (let i = maxWidth - 1; i >= 0; i--) {
              if (testWhite(linesSeparate[j].charAt(i))) {
                  res = res + [linesSeparate[j].slice(0, i), newLineStr].join('');
  
                  //don't remove slash, but break line
                  if(testSlash(linesSeparate[j].charAt(i))){
                    linesSeparate[j] = linesSeparate[j].slice(i);
                  }
                  // remove white space completely
                  else{
                    linesSeparate[j] = linesSeparate[j].slice(i + 1);
                  }
                  
                  found = true;            
                  break;
              }
          }
          // Inserts new line at maxWidth position, the word is too long to wrap
          if (!found) {
              res += [linesSeparate[j].slice(0, maxWidth), newLineStr].join('');
              linesSeparate[j] = linesSeparate[j].slice(maxWidth);        
          }
        } 
      
        lines +=  res + linesSeparate[j] + "\n"
      
      }
          
        
        //let lines = res + str
        let finalLines = lines.split('\n') 
        let croppedResult = ''
      
        for(let i=0; i < maxLines && i < finalLines.length; i++){
          if(i == maxLines - 1 ){
            croppedResult += finalLines[i] 
          }
          else{
            croppedResult += finalLines[i] + '\n'  
          }
        }
      
        // if(finalLines.length > maxLines){
        //   croppedResult += '...'
        // }
        return croppedResult;
    }
    else {
      return str
    }
  
    
  }

  export function dateFromGoogle(inputEpoch:string):string{   

    let date = new Date(parseInt(inputEpoch)*1000);
    let year = date.getUTCFullYear().toString()

    //convert month from 0-based index to 1-based index
    let month = date.getUTCMonth() +1
    
    let day = date.getUTCDate()
    let hours = date.getUTCHours()
    let minutes = date.getUTCMinutes()
    
    let monthString = month.toString()
    let dayString = day.toString()
    let hoursString = hours.toString()
    let minutesString = minutes.toString()

    if(month < 10){
      monthString = "0" + monthString
    }
    if(day < 10){
      dayString = "0" + dayString
    }
    if(hours < 10){
      hoursString = "0" + hoursString
    }
    if(minutes < 10){
      minutesString = "0" + minutesString
    }
    
    //OUTPUT FORMAT: 2025-02-08T15:30:00.000Z

    // console.log("DATE FROM GOOGLE: " + (year + "-" + monthString + "-" + dayString + "T" + hoursString + ":" + minutesString + ":00.000Z" ))

    return (year + "-" + monthString + "-" + dayString + "T" + hoursString + ":" + minutesString + ":00.000Z" )
  }

  
  function testWhite(x:string):boolean {
    var white = new RegExp(/^[\s/]+$/);
    return white.test(x.charAt(0));
  }
  
  function testSlash(x:string):boolean{
    var white = new RegExp(/^[/]+$/);
    return white.test(x.charAt(0));
  }
  
  export function shortenText(text: string, maxLenght: number) {
    let finalText: string = ''
  
    if (text.length > maxLenght) {
      finalText = text.substring(0, maxLenght)
      finalText = finalText.concat('...')
    } else {
      finalText = text
    }
  
    return finalText
  }

  export function getTimeStringFromDate(date:string):string{
    
    const dateObj = new Date(parseInt(date)*1000);     
    const hours = dateObj.getUTCHours().toString().padStart(2, '0');
    const minutes = dateObj.getUTCMinutes().toString().padStart(2, '0');
    //console.log("TIME FROM DATE: " + `${hours}:${minutes}`)
    return `${hours}:${minutes}`;
  }

  export function isLive(dateStart:string, dateEnd:string):boolean{
    let eventStartTime = Date.parse(dateStart)
    let eventEndTime = Date.parse(dateEnd)
    let currentTime = Date.now()

    return currentTime >= eventStartTime && currentTime <= eventEndTime
    //return Math.random() > 0.5
  }
  export function hasEnded(dateStart:string, dateEnd:string):boolean{
    
    let eventStartTime = Date.parse(dateStart)
    let eventEndTime = Date.parse(dateEnd)
    let currentTime = Date.now()

    if( isLive(dateStart, dateEnd)){
      return false
    }

    return currentTime > eventEndTime
    //return Math.random() > 0.5
  }

  export function dateToRemainingTime(dateStart:string):string{

    let eventStartTime = Date.parse(dateStart)
    let currentTime = Date.now()
  
    
  
  
  //complete remaining time in MILLISECONDS
    let remainingTime = eventStartTime - currentTime
  
    //complete remaining time in SECONDS
    let fullSeconds  =  Math.abs(Math.floor(remainingTime / 1000))
  
    //complete remaining time in HOURS
    let fullHours = Math.abs(Math.floor(fullSeconds/3600))
    
    //complete remaining time in HOURS
    let fullDays =  Math.abs(Math.floor(fullHours/24))
    
    let fractionHour = fullSeconds/3600 - fullHours
    let leftoverMinutes = Math.floor(fractionHour * 60)
    
    let finalTime = fullHours
    let finalUnit = "hours"
  
   
    if(fullDays > 1){
      finalTime = Math.abs(fullDays)
      finalUnit = "DAYS"
    }
    
    if(fullDays == 1){
      finalTime = Math.abs(fullDays)
      finalUnit = "DAY"
    }  
  
    if(Math.abs(fullDays) < 1){
      if(fullHours == 0){
        finalTime = leftoverMinutes
        finalUnit = "MINS"
      }
      if(fullHours == 1){
        finalTime = Math.abs(fullHours)
        finalUnit = "HOUR"
      }    
      if(fullHours > 1 ){
        finalTime = Math.abs(fullHours)
        finalUnit = "HRS"
      }
    }
    
      
        
    
  
    let endString = (finalTime + " " + finalUnit)
  
    if( remainingTime < 0){
      endString = ("ended")
    }
  
  
    return endString
  }

  function compareEvents(a:any, b:any):number{ 
 
    
    if(a.startDate < b.startDate){ return -1 }
    if(a.startDate > b.startDate){ return 1 } 
  
    return 0
  }
  
  export function sortEvents(events:any[]):any[]{ 
  
    events.sort((a, b) => {
      return compareEvents(a, b)
    })
  
    let rank = 0   
   
    return events
 
  }
  