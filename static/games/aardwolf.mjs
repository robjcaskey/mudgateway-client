import {GlobTrigger} from '../Glob.mjs';
import {FireElementWrap, FireWraps, ansiListToString, readMatchOnto, replaceMatches, mapSeries} from '../util.mjs';


function clobberOntoElement(containerElement) {
  return matches =>  {
    var tagContent = $("<span>").css({backgroundColor:'green',borderRadius:'1em'});
    return mapSeries(matches.map( match => ()=> readMatchOnto(match, tagContent)))
    .then(()=> {
      containerElement.empty();
      containerElement.append(tagContent);
      // following line wont be needed once we properly handle appending to non-block elements
      containerElement.find("br").remove();
      var placeholderContent = $("<span>", {class:'promptPlaceholder'});
      return replaceMatches(matches, placeholderContent)
    });
  }
}

var currentRoom = {
}

function setupTriggers(mudSession) {
  var promptElement = $("#prompt");
  mudSession.addAnsiByteTrigger({disabled:true,order:400,description:"Prompt",match:GlobTrigger("\n*Daily* > "), fire:clobberOntoElement(promptElement)});
  mudSession.addAnsiByteTrigger({disabled:true,order:400,description:"Prompt",match:GlobTrigger("\n*Fighting*> "), fire:clobberOntoElement(promptElement)});
  var combatPatterns = [
    "\n*LACERATES*]",
    "\n*DECIMATES*]",
    "\n*misses you.*]",
    "\nYou dodge * attack.",
    "\n* is in perfect health.",
    "\n* has a few minor scratches.",
  ];
  combatPatterns.map(pattern => {
    mudSession.addAnsiByteTrigger({disabled:true,order:400,description:"Combat spam",match:GlobTrigger(pattern), fire:FireElementWrap($("<span>").addClass("aardCombatSpam"), (element, matches)=>{
      return mapSeries(matches.map(match => {
        return ()=> {
          return readMatchOnto(match, element);
        }
      }))
      .then(()=> {
        // following line wont be needed once we properly handle appending to non-block elements
        element.find("br").remove();
        return element;
      })
    })});
  });
  mudSession.addGmcpTrigger({disabled:false,description:"Reconnecting", fire:(gmcpName, gmcpData)=>{
/*
    var div = $("<div>",{class:"alert alert-success"});
    div.append($("<span>").css({fontWeight:'bold'}).text(gmcpName));
    div.append($("<span>").text(JSON.stringify(gmcpData)));
    $("#scrollback").append(div);
*/
  }});
  mudSession.addAnsiByteTrigger({disabled:false,order:400,description:"Reconnecting",match:GlobTrigger("############ Reconnecting to Game #############"), fire:(matches)=>{
    return onLogIn(mudSession);
  }});
  mudSession.addAnsiByteTrigger({disabled:false,order:400,description:"Reconnecting",match:GlobTrigger("you have now completed character creation."), fire:(matches)=>{
    return onNewCharacter(mudSession);
  }});
  mudSession.addAnsiByteTrigger({order:400,disabled:false,description:"Create character prompt",match:GlobTrigger("create a new character\n"), fire:FireWraps(extract =>  {
    return $("<div>")
    .addClass("btn btn-outline-primary")
    .css({
      "border":"2px solid blue"
    })
    .text(ansiListToString(extract))
    .click(()=>{
      mudSession.sendCommand("NEW")
    });
  })});
  mudSession.addAnsiByteTrigger({order:400,disabled:false,description:"auto opt-in to color at character-create",match:GlobTrigger("\rUse Color?"), fire:()=> {
    mudSession.sendCommand("Y")
  }});
  mudSession.addAnsiByteTrigger({order:400,disabled:false,description:"Choose class",match:GlobTrigger("Choose your primary class,"), fire:FireWraps(extract =>  {
    var container = $("<span>");
    container.append($("<h4>",{text:"Choose your primary class."}))
    var options = ["Mage","Warrior","Thief","Ranger","Psi","Paladin","Cleric"].map(option => {
      return $("<span>")
      .addClass("btn btn-outline-primary")
      .css({
        "border":"2px solid blue"
      })
      .text(option)
      .click(()=>{
        mudSession.sendCommand(option)
      });
    });
    return $(container).append(options);
  })});
  mudSession.addAnsiByteTrigger({disabled:false,order:400,description:"Map",match:GlobTrigger("<MAPSTART>@<MAPEND>"), fire:matches => {
    var outboundElement = $("<span>").addClass("aardMap");
    return readMatchOnto(matches[1], outboundElement)
    .then(()=> {
      outboundElement.find("span:contains('Exits')").last().remove()
      $("#map").empty();
      $("#map").append(outboundElement);
      var replacementElement = $("<span>").text("Map was here");
      return replaceMatches(matches, document.createComment("MAP was here but replaced by trigger"))
    });
  }});
  mudSession.addAnsiByteTrigger({order:400,disabled:false,description:"Choose Yes No",match:GlobTrigger("[Y/N]"), fire:FireWraps(extract =>  {
    var yes = $("<span>")
    .addClass("btn btn-outline-primary")
    .css({
      "border":"2px solid blue"
    })
    .text("Yes")
    .click(()=>{
      mudSession.sendCommand("Y")
    });
    var no  = $("<span>")
    .addClass("btn btn-outline-primary")
    .css({
      "border":"2px solid blue"
    })
    .text("No")
    .click(()=>{
      mudSession.sendCommand("N")
    });
    return $("<span>").append([yes, no]);
  })});
  mudSession.addAnsiByteTrigger({order:400,disabled:false,description:"Line Rule",match:GlobTrigger("-----------------------------------------------------------------------------\n"), fire:FireWraps(()=>$("<hr>"))});
  function sayMatches(matches) {
   console.log("wrap fired hr matches "+matches,matches)
  }
  function aardUnmatchedTrigger(tagName, elementTemplate) {
    mudSession.addAnsiByteTrigger({order:400,disabled:false,description:"aardTag-unmatched-"+tagName,match:GlobTrigger("{"+tagName+"}@\n"), fire:(matches => {
      var element = elementTemplate ? elementTemplate.clone() : $("<span>");
      var tagContent = element.addClass("aardTag-"+tagName);
      return readMatchOnto(matches[1], tagContent)
      .then(()=> {
        return replaceMatches(matches, tagContent)
      });
    })})
  }
  function aardMatchedTrigger(tagName, elementTemplate) {
    mudSession.addAnsiByteTrigger({order:400,disabled:false,description:"aardTag-matched-"+tagName,match:GlobTrigger("{"+tagName+"}\n@{/"+tagName+"}\n"), fire:(matches => {
      var element = elementTemplate ? elementTemplate.clone() : $("<span>");
      var tagContent = element.addClass("aardTag-"+tagName);
      return readMatchOnto(matches[1], tagContent)
      .then(()=> {
        return replaceMatches(matches, tagContent)
      });
    })})
  }
  function aardRoomCharsTrigger(tagName, elementTemplate) {
    mudSession.addAnsiByteTrigger({order:400,disabled:false,description:"aardTag-matched-"+tagName,match:GlobTrigger("{"+tagName+"}\n@{/"+tagName+"}\n"), fire:(matches => {
      var element = elementTemplate ? elementTemplate.clone() : $("<span>");
      var tagContent = element.addClass("aardTag-"+tagName);
      return readMatchOnto(matches[1], tagContent)
      .then(()=> {
        return replaceMatches(matches, tagContent)
        .then(x => {
          currentRoom.charsElement = element;
          console.log("CURRENT ROOM",currentRoom);
          return x;
        })
      });
    })})
  }
  aardUnmatchedTrigger("rname",$("<div>"));
  aardMatchedTrigger("rdesc");
  aardMatchedTrigger("roomobjs");
  aardRoomCharsTrigger("roomchars");
  aardUnmatchedTrigger("exits");
  aardUnmatchedTrigger("coords");
  //mudSession.addAnsiByteTrigger({order:400,disabled:false,description:"aardTag-matched-chan",match:GlobTrigger("{chan ch=*}*"), fire:ClassWrap("div","aardTag-chan")});
  aardUnmatchedTrigger("repop");
  aardUnmatchedTrigger("affon");
  aardUnmatchedTrigger("affoff");
/*
  mudSession.addAnsiByteTrigger({disabled:false,order:400,description:"Map",match:GlobTrigger("<MAPSTART>@<MAPEND>"), fire:matches => {
    var outboundElement = $("<span>").addClass("aardMap");
    return readMatchOnto(matches[1], outboundElement)
    .then(()=> {
      $("#map").empty();
      $("#map").append(outboundElement);
      var replacementElement = $("<span>").text("Map was here");
      return replaceMatches(matches, document.createComment("MAP was here but replaced by trigger"))
    });
  }});
  mudSession.addAnsiByteTrigger({order:400,disabled:false,description:"Choose subclass",match:GlobTrigger("* SUBCLASSES ]"), fire:FireWraps(extract =>  {
    var container = $("<span>");
    container.append($("<h4>",{text:"Choose your subclass."}))
    var options = ["TEST A","TEST B"].map(option => {
      return $("<span>")
      .addClass("btn btn-outline-primary")
      .css({
        "border":"2px solid blue"
      })
      .text(option)
      .click(()=>{
        mudSession.sendCommand(option)
      });
    });
    return $(container).append(options);
  })});
*/

}

function onLogIn(mudSession) {
  var tags = ["bigmap","channels","coords","editors","equip","exits","helps","inv","map","mapexits","mapnames","roomdescs","roomnames","telopts","says","score","skillgains","spellups","tells","mapdata","roomchars","roomobjs","scan","repop"]
  var tagPromises = tags.map(tagName => {
    return mudSession.sendCommand("tags "+tagName+" on")
  });
  return Promise.all(tagPromises)
  .then(()=> {
    return mudSession.sendCommand("tags on");
  })
  .then(()=> {
    return mudSession.sendCommand("look");
  });
}
function onNewCharacter(mudSession) {
  return Promise.resolve(()=> {
    return mudSession.sendCommand("\n");
  })
  .then(()=> {
    return onLogIn(mudSession);
  });
}



function enableQuickMode(mudSession) {
  function killOne() {
    var name = currentRoom.charsElement.find(".ansi").first().text();
    var doc = nlp(name);
    var nouns = doc.nouns().out('text');
    var noun = nouns.trim().split(" ")[0];
    cmd("kill "+noun);
  }
  var cmd = (x) => mudSession.sendCommand(x);
  var escMode = false;
  function handleKey(e) {
    if(!escMode) {
      if(e.keyCode == "27") {
        escMode = true;
        return false;
      }
    }
    else {
      if(e.keyCode == 75) cmd("north");
      else if(e.keyCode == 81) cmd("kick");
      else if(e.keyCode == 87) cmd("bash");
      else if(e.keyCode == 69) cmd();
      else if(e.keyCode == 82) cmd();
      else if(e.keyCode == 74) cmd("south");
      else if(e.keyCode == 72) cmd("west");
      else if(e.keyCode == 76) cmd("east");
      else if(e.keyCode == 73) escMode = false;
      else if(e.keyCode == 38) cmd("north");
      else if(e.keyCode == 40) cmd("south");
      else if(e.keyCode == 37) cmd("west");
      else if(e.keyCode == 39) cmd("east");
      else if(e.keyCode == 13) escMode = false;
      else if(e.keyCode == 88) killOne(); // x
      return false;
    }
  }
  $("#commandLine").keydown(handleKey);
}

export function onNewSession(mudSession) {
  enableQuickMode(mudSession);
  return setupTriggers(mudSession);
}

