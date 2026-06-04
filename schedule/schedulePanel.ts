import { ColliderLayer, EasingFunction, engine, Entity, InputAction, Material, MaterialTransparencyMode, MeshCollider, MeshRenderer, PBMaterial_UnlitMaterial, PointerEvents, pointerEventsSystem, Schemas, TextAlignMode, TextShape, Transform, TransformTypeWithOptionals, Tween, VisibilityComponent } from "@dcl/sdk/ecs";
import { Color4, Quaternion, Vector3 } from "@dcl/sdk/math";
import { scheduleConfig } from "./uvConfig";
import { dateToRemainingTime, getTimeStringFromDate, hasEnded, isLive, wordWrap } from "./helperFunctions";
import { initScheduleDownload } from "./fetchData";
import { openExternalUrl, teleportTo } from "~system/RestrictedActions";
import { animateNoMoreScroll, animateScrollRow } from "./uiAnimations";

const firstColumnPivot = -0.84
const secondColumnPivot =  -0.84
const thirdColumnPivot = 0.42
const fourthColumnPivot = 0.8
const liveTextColor = Color4.fromHexString("#212121ff")
const nonLiveTextColor= Color4.fromHexString("#ffffffff")
const ROWS_PER_PAGE = 6

const MAX_TITLE_CHARS = 49

const scheduleSkinMaterial:PBMaterial_UnlitMaterial ={
    texture: Material.Texture.Common({src:"images/schedule/testing2.png"}),
    alphaTest: MaterialTransparencyMode.MTM_ALPHA_BLEND,
    alphaTexture: Material.Texture.Common({src:"images/schedule/testing2.png"}),

} 
const scheduleSkinMaterial2:PBMaterial_UnlitMaterial ={
    diffuseColor: Color4.Black()

} 
const ScheduleRowSchema = Schemas.Map({   
    row: Schemas.Number,
    rowRoot: Schemas.Entity,
    timeText: Schemas.Entity,
    titleRoot: Schemas.Entity,
    titleText: Schemas.Entity,
    companyText: Schemas.Entity,
    description: Schemas.Entity,
    liveText: Schemas.Entity,
    liveHighlight: Schemas.Entity,
    startsInText: Schemas.Entity,
    jumpInButton: Schemas.Entity,
})

const jsonSchema = Schemas.Map({
    title: Schemas.String,
    description: Schemas.String,
    startDate: Schemas.String,
    endDate: Schemas.String,
    coordX: Schemas.Number,
    coordY: Schemas.Number,
    color: Schemas.String,
    startEpoch: Schemas.String,
    endEpoch: Schemas.String,
    isVisible: Schemas.Boolean
})
export const SchedulePanel = engine.defineComponent('schedule-panel', {
    entity: Schemas.Entity,  
    rows: Schemas.Array(ScheduleRowSchema),
    data: Schemas.Array(jsonSchema),
    currentIndex: Schemas.Number
})

// save the full schedule data to the schedule panel
export function saveFullScheduleData(data:any) {
    let panelGroup = engine.getEntitiesWith(SchedulePanel)
    for( let [panelEntity] of panelGroup){
        let panelInfo = SchedulePanel.getMutable(panelEntity)

        for(let i = 0; i < data.length; i++){

            if(i < panelInfo.data.length){
                panelInfo.data[i].title = data[i].title
                panelInfo.data[i].description = data[i].description
                panelInfo.data[i].startDate = data[i].startDate
                panelInfo.data[i].endDate = data[i].endDate
                panelInfo.data[i].coordX = data[i].coordX
                panelInfo.data[i].coordY = data[i].coordY
                panelInfo.data[i].color = data[i].color
                panelInfo.data[i].startEpoch = data[i].startEpoch
                panelInfo.data[i].endEpoch = data[i].endEpoch
                panelInfo.data[i].isVisible = data[i].isVisible
            }else{
                let dataRow = {
                    title: data[i].title,
                    description: data[i].description,
                    startDate: data[i].startDate,
                    endDate: data[i].endDate,
                    coordX: data[i].coordX,
                    coordY: data[i].coordY,
                    color: data[i].color,
                    startEpoch: data[i].startEpoch,
                    endEpoch: data[i].endEpoch,
                    isVisible: data[i].isVisible
                }
                panelInfo.data.push(dataRow)
            }
           
        }        
    }
}

// update the schedule panels from the locally saved full-length data
function updateSchedulePanels() {
    let panelGroup = engine.getEntitiesWith(SchedulePanel)
    for( let [panelEntity, panelInfo] of panelGroup){
        let panelInfo = SchedulePanel.getMutable(panelEntity)
        

        let i = 0
        let currentIndex = panelInfo.currentIndex
        if (currentIndex < panelInfo.data.length-3){ 
            for(let j = currentIndex; j <  panelInfo.data.length; j++){

                if(i >= ROWS_PER_PAGE) break
                updateRow( i, panelInfo.data[j])
                i++
            }
        }       
    }    
}

function scrollUp(){
    let panelGroup = engine.getEntitiesWith(SchedulePanel)
    for( let [panelEntity, panelInfo] of panelGroup){
        let panelInfo = SchedulePanel.getMutable(panelEntity)
        panelInfo.currentIndex--
        if(panelInfo.currentIndex < 0){
            panelInfo.currentIndex = 0
            animateNoMoreScroll(true)
            return
        } 
    }
    animateScrollRow(true)
    updateSchedulePanels()
}

function scrollDown(){
    let panelGroup = engine.getEntitiesWith(SchedulePanel)
    for( let [panelEntity, panelInfo] of panelGroup){
        let panelInfo = SchedulePanel.getMutable(panelEntity)
        panelInfo.currentIndex++
        if(panelInfo.currentIndex > panelInfo.data.length-ROWS_PER_PAGE){
            panelInfo.currentIndex = panelInfo.data.length-ROWS_PER_PAGE
            animateNoMoreScroll(false)
            return
        }        
    }
    animateScrollRow(false)
    updateSchedulePanels()
}
// scroll to the first event that has not ended
export function scrollToClosestEvent(){
    let panelGroup = engine.getEntitiesWith(SchedulePanel)
    for( let [panelEntity, panelInfo] of panelGroup){       
        
        for(let i = 0; i < panelInfo.data.length; i++){
            let eventEnded = hasEnded(panelInfo.data[i].startDate, panelInfo.data[i].endDate)
            if(!eventEnded){
                let panelInfoMutable = SchedulePanel.getMutable(panelEntity)
                
                if (i >  panelInfo.data.length-ROWS_PER_PAGE){
                    panelInfoMutable.currentIndex = panelInfo.data.length-ROWS_PER_PAGE
                }else{
                    panelInfoMutable.currentIndex = i
                }
                break
            }
        }
        updateSchedulePanels()
    }
}

function updateRow(rowIndex: number, rowData: any) {
  const panelGroup = engine.getEntitiesWith(SchedulePanel)

  for (let [panelEntity, panelInfo] of panelGroup) {
    const row = panelInfo.rows[rowIndex]
    if (!row) continue

    // 1) Hora/fecha: no la usamos para jobs
    const timeTextComp = TextShape.getMutable(row.timeText)
    timeTextComp.text = ''
    timeTextComp.fontSize = 0.1

    // 2) Título + empresa en una sola línea
    const titleTextComponent = TextShape.getMutable(row.titleText)
    const companyTextComponent = TextShape.getMutable(row.companyText)

    // título completo que viene de la API
    const fullTitle = (rowData.title || '').trim()

    // separamos por " at "
    let position = fullTitle
    let company = ''

    const atIndex = fullTitle.toLowerCase().lastIndexOf(' at ')
    if (atIndex > 0) {
      position = fullTitle.slice(0, atIndex).trim()
      company = fullTitle.slice(atIndex + 4).trim()
    } else {
      position = position.trim()
    }

    const MAX_POSITION_CHARS = 30
    if (position.length > MAX_POSITION_CHARS) {
      position = position.slice(0, MAX_POSITION_CHARS - 3) + '...'
    }

    let finalText = position || '-'
    if (company) {
      finalText = `${position} at <color=#18A187>${company}</color>`
    }

    titleTextComponent.text = finalText
    titleTextComponent.fontSize = 0.8
    titleTextComponent.textColor = Color4.White()
    titleTextComponent.outlineColor = Color4.White()
    titleTextComponent.outlineWidth = 0.3
    titleTextComponent.textAlign = TextAlignMode.TAM_MIDDLE_LEFT
    companyTextComponent.text = ''
    companyTextComponent.fontSize = 0.6
    companyTextComponent.textColor = Color4.fromHexString('#4ad91aff')

    const desc = rowData.description || ''
    const wrappedText = wordWrap(desc, 40, 2)
    TextShape.getMutable(row.description).text = wrappedText
    Transform.getMutable(row.titleRoot).position.y = 0

    const liveTextComponent = TextShape.getMutable(row.liveText)
    liveTextComponent.text = ''
    liveTextComponent.textColor = nonLiveTextColor
    liveTextComponent.outlineColor = nonLiveTextColor
    liveTextComponent.fontSize = 0.8

    VisibilityComponent.getMutable(row.startsInText).visible = false
    VisibilityComponent.getMutable(row.liveHighlight).visible = false

    if (VisibilityComponent.has(row.jumpInButton)) {
      VisibilityComponent.getMutable(row.jumpInButton).visible = false
    } else {
      VisibilityComponent.create(row.jumpInButton, { visible: false })
    }
  }
}


export function addSchedulePanel(transform:TransformTypeWithOptionals, refreshRateSeconds = 0) {

   if (refreshRateSeconds) initScheduleDownload(refreshRateSeconds)
    
    //root
    const panelRoot = engine.addEntity()
    SchedulePanel.createOrReplace(panelRoot,{
        entity: panelRoot,
        currentIndex: 0
    })
    Transform.createOrReplace(panelRoot, transform)
    const backPlane = engine.addEntity()
    Transform.createOrReplace(backPlane, {
        position: Vector3.create(0, -0.5, 0),
        rotation: Quaternion.fromEulerDegrees(0, 0, 0),
        scale: Vector3.create(2.6, 2, 1),
        parent: panelRoot
    })

    MeshRenderer.setPlane(backPlane)
    MeshCollider.setPlane(backPlane, ColliderLayer.CL_POINTER)
    Material.setBasicMaterial(backPlane, scheduleSkinMaterial2)
    pointerEventsSystem.onPointerDown(
        {
            entity: backPlane,
            opts: {
                button: InputAction.IA_ANY,                
                showHighlight: false,
                hoverText: 'SCROLL [E/F]',
            },
        },
        function (cmd) {          
            if(cmd.button === InputAction.IA_PRIMARY){
                scrollUp()
              } else if (cmd.button === InputAction.IA_SECONDARY){
                scrollDown()
              }else if (cmd.button === InputAction.IA_POINTER) {
            // 👉 acción extra acá
            openExternalUrl({ url: "https://web3.career/top-web3-jobs?utm_source=decentraland" })
    }
              
        }
    )
   
    const headerPanel = engine.addEntity()
    Transform.createOrReplace(headerPanel, {
        position: Vector3.create(0, 0.5 + 1/8, 0),
        rotation: Quaternion.fromEulerDegrees(0, 0, 0),
        scale: Vector3.create(2.6, 2/8, 1),
        parent: panelRoot
    })
    MeshRenderer.setPlane(headerPanel)
    Material.setBasicMaterial(headerPanel, scheduleSkinMaterial2)
    const mainTitle = engine.addEntity()
    Transform.createOrReplace(mainTitle, {
        position: Vector3.create(0, 0.6, -0.01),  // bien arriba de la primera fila
        rotation: Quaternion.fromEulerDegrees(0, 0, 0),
        scale: Vector3.create(1, 1, 1),
        parent: panelRoot
    })

    TextShape.createOrReplace(mainTitle, {
        text: "EXPLORE OPEN ROLES ON OUR WEBSITE",
        fontSize: 0.8,
        textColor: Color4.fromHexString("#18A187"),
        outlineColor: Color4.Black(),
        outlineWidth: 0.2,
        textAlign: TextAlignMode.TAM_MIDDLE_CENTER
    })

const TOP_Y = 0.75
const BOTTOM_Y = -1.5

const SIDE_CENTER_Y = (TOP_Y + BOTTOM_Y) / 2      // -0.375
const SIDE_HEIGHT = TOP_Y - BOTTOM_Y              // 2.25

const SIDE_X = 1 + 1/8
const SIDE_W = 2/8

// const decoPanelLeft = engine.addEntity()
// Transform.createOrReplace(decoPanelLeft, {
//   position: Vector3.create(-SIDE_X, SIDE_CENTER_Y, 0),
//   rotation: Quaternion.fromEulerDegrees(0, 0, 0),
//   scale: Vector3.create(SIDE_W+0.01, SIDE_HEIGHT, 1),
//   parent: panelRoot
// })
// MeshRenderer.setPlane(decoPanelLeft)
// Material.setBasicMaterial(decoPanelLeft, scheduleSkinMaterial2)

// const decoPanelRight = engine.addEntity()
// Transform.createOrReplace(decoPanelRight, {
//   position: Vector3.create(SIDE_X, SIDE_CENTER_Y, 0),
//   rotation: Quaternion.fromEulerDegrees(0, 0, 0),
//   scale: Vector3.create(SIDE_W +0.01, SIDE_HEIGHT, 1),
//   parent: panelRoot
// })
// MeshRenderer.setPlane(decoPanelRight)
// Material.setBasicMaterial(decoPanelRight, scheduleSkinMaterial2)


    //previous button panel   
    const prevButton = engine.addEntity()
    Transform.createOrReplace(prevButton, {
        position: Vector3.create(-0.5, -1.2, 0),
        rotation: Quaternion.fromEulerDegrees(0, 0, 0),
        scale: Vector3.create(1, 2/8, 1),
        parent: panelRoot
    })
    MeshRenderer.setPlane(prevButton)
    MeshCollider.setPlane(prevButton, ColliderLayer.CL_POINTER)
    Material.setBasicMaterial(prevButton, scheduleSkinMaterial2)

    pointerEventsSystem.onPointerDown(
        {
            entity: prevButton,
            opts: {
                button: InputAction.IA_POINTER,
                hoverText: 'PREVIOUS',
                showHighlight: false,
            },
        },
        function () {
           //console.log('PREV')
           scrollUp()
        }
    )

    const prevButtonText = engine.addEntity()
    Transform.createOrReplace(prevButtonText, {
        position: Vector3.create(-0.5, -1.2, -0.005),
        rotation: Quaternion.fromEulerDegrees(0, 0, 0),
        scale: Vector3.create(0.9, 1, 1),
        parent: panelRoot
    })

    TextShape.createOrReplace(prevButtonText, {
        text: "<b>SEE PREVIOUS [E]</b>",
        fontSize: 0.7,
        textColor: Color4.fromHexString("#ffffff"),  
        outlineColor: Color4.White()    ,
        outlineWidth: 0.2  
    })

    //next button panel
    const nextButton = engine.addEntity()
    Transform.createOrReplace(nextButton, {
        position: Vector3.create(0.5, -1.2, 0),
        rotation: Quaternion.fromEulerDegrees(0, 0, 0),
        scale: Vector3.create(1, 2/8, 1),
        parent: panelRoot
    })
    MeshRenderer.setPlane(nextButton)
    MeshCollider.setPlane(nextButton, ColliderLayer.CL_POINTER)    
    Material.setBasicMaterial(nextButton, scheduleSkinMaterial2)
    
    const nextButtonText = engine.addEntity()
    Transform.createOrReplace(nextButtonText, {
        position: Vector3.create(0.5, -1.2, -0.005),
        rotation: Quaternion.fromEulerDegrees(0, 0, 0),
        scale: Vector3.create(0.9, 1, 1),
        parent: panelRoot
    })

    TextShape.createOrReplace(nextButtonText, {
        text: "<b>SEE NEXT [F]</b>",
        fontSize: 0.7,
        textColor: Color4.fromHexString("#ffffff"),  
        outlineColor: Color4.White()    ,
        outlineWidth: 0.2  
    })

    pointerEventsSystem.onPointerDown(
        {
            entity: nextButton,
            opts: {
                button: InputAction.IA_POINTER,
                hoverText: 'NEXT',
                showHighlight: false,
            },
        },
        function () {
          // console.log('NEXT')
           scrollDown()
        }
    )   

    for(let j = 0; j < ROWS_PER_PAGE; j++){
        addScheduleDataRow(panelRoot, j )                  
    }
    updateSchedulePanels()
}

function addScheduleDataRow(root:Entity, row:number, ) {  
    
    const panelInfo = SchedulePanel.getMutable(root)

    const rowRoot = engine.addEntity()
    Transform.createOrReplace(rowRoot, {
        position: Vector3.create(0, 0.36 - row * 1/4, 0),        
        parent: root
    })

    // add separator line between rows
    if(row < ROWS_PER_PAGE - 1){
        const separatorLine = engine.addEntity()
        Transform.createOrReplace(separatorLine, {
            position: Vector3.create(0, -0.11, -0.002),  
            scale: Vector3.create(2, 0.005, 1),      
            parent: rowRoot
        })
        MeshRenderer.setPlane(separatorLine)
        Material.setBasicMaterial(separatorLine, {diffuseColor: Color4.fromHexString("#18A187")})
    }

   
    
    // STAR TIME
    const timeRoot = engine.addEntity()
    Transform.createOrReplace(timeRoot, {
        position: Vector3.create(firstColumnPivot,0, 0),        
        parent: rowRoot
    })

    const timeText = engine.addEntity()
    Transform.createOrReplace(timeText, {
        position: Vector3.create(0, 0.03, -0.005),        
        parent: timeRoot
    })

    TextShape.createOrReplace(timeText, {   
        text: "--:--",
        fontSize: 0.8,
        textColor: Color4.fromHexString("#ffffff"),  
        outlineColor: Color4.White()    ,
        outlineWidth: 0.3  
    })

    // UTC TEXT
    const utcText = engine.addEntity()
    Transform.createOrReplace(utcText, {
        position: Vector3.create(0, -0.03, -0.005),       
        parent: timeRoot
    })
    
    TextShape.createOrReplace(utcText, {
        text: "",
        fontSize: 0.5,
        textColor: Color4.fromHexString("#ffffff"),          
    })

    // TITLE TEXT + DESCRIPTION    
    // check if the description is too long to fit in one row
     let verticalOffset = 0

    const titleRoot = engine.addEntity()
    Transform.createOrReplace(titleRoot, {
        position: Vector3.create(secondColumnPivot, verticalOffset , -0.005),        
        parent: rowRoot
    })

    const titleText = engine.addEntity()
    Transform.createOrReplace(titleText, {
        position: Vector3.create(0, 0.03, -0.005),       
        parent: titleRoot
    })

    TextShape.createOrReplace(titleText, {
        text: "-",
        fontSize: 0.8,
        textColor:  Color4.White(),  
        outlineColor: Color4.White()    ,
        outlineWidth: 0.3  ,
        textAlign: TextAlignMode.TAM_MIDDLE_LEFT
    })

    const companyText = engine.addEntity()
    Transform.createOrReplace(companyText, {
    position: Vector3.create(0, 0.01, -0.005),  // debajo del título
    parent: titleRoot
    })

    TextShape.createOrReplace(companyText, {
    text: "",
    fontSize: 0.6,
    textColor: Color4.fromHexString("#18A187"), // color para la empresa
    textAlign: TextAlignMode.TAM_MIDDLE_LEFT
    })

    
    // DESCRIPTION TEXT
    const descriptionText = engine.addEntity()
    Transform.createOrReplace(descriptionText, {
        position: Vector3.create(0, -0.01, -0.005),        
        parent: titleRoot
    })

   

    TextShape.createOrReplace(descriptionText, {
        text: "N/A"  ,
        fontSize: 0.5,
        textColor: Color4.fromHexString("#ffffff"), 
        textAlign: TextAlignMode.TAM_TOP_LEFT
    })

    const liveRoot = engine.addEntity()
    Transform.createOrReplace(liveRoot, {
        position: Vector3.create(fourthColumnPivot,0, -0.005),
        parent: rowRoot
    })


    // LIVE/ENDED TEXT 
    let eventLive= false
    let liveString = "-"
    let liveOffsetVertical = 0.01
    let eventEnded = false
  

    const liveText = engine.addEntity()
    Transform.createOrReplace(liveText, {
        position: Vector3.create(0, liveOffsetVertical, -0.004),
        parent: liveRoot
    })

    TextShape.createOrReplace(liveText, {
        text: liveString,
        fontSize: 0.8,
        textColor:  eventLive ? liveTextColor : nonLiveTextColor,
        outlineColor: eventLive ? liveTextColor : nonLiveTextColor    ,
        outlineWidth: 0.3  
    })

    // LIVE HIGHLIGHT background if event is live
    const liveHighlight = engine.addEntity()
    Transform.createOrReplace(liveHighlight, {
        position: Vector3.create(0, 0.015, -0.002),        
        scale: Vector3.create(0.4, 0.24, 1),
        parent: liveRoot
    })

    MeshRenderer.setPlane(liveHighlight)
    Material.setBasicMaterial(liveHighlight, {
       diffuseColor: Color4.fromHexString("#1FFF5EFF")
    })

    VisibilityComponent.createOrReplace(liveHighlight, {
        visible: false
    })

    // "STARTS IN:" TEXT
    const startsInText = engine.addEntity()
    Transform.createOrReplace(startsInText, {
        position: Vector3.create(0, 0.05, -0.02),        
        parent: liveRoot
    })
    TextShape.createOrReplace(startsInText, {
        text: "STARTS IN",
        fontSize: 0.4,
        textColor: Color4.fromHexString("#ffffff"),        
    })

    VisibilityComponent.createOrReplace(startsInText, {
        visible: !eventLive && !eventEnded
    })

    // JUMP IN BUTTON ARROW
    const jumpInButton = engine.addEntity()
    Transform.createOrReplace(jumpInButton, {
        position: Vector3.create(thirdColumnPivot,  0, -0.02),        
        scale: Vector3.create(1/8, 1/8, 1),
        parent: rowRoot
    })
    MeshRenderer.setPlane(jumpInButton, scheduleConfig.jumpInButton.uvs)
    MeshCollider.setPlane(jumpInButton, ColliderLayer.CL_POINTER)
    Material.setBasicMaterial(jumpInButton, {
        texture: Material.Texture.Common({src:"images/schedule/schedule_skin_atlas.png"}),
        alphaTexture: Material.Texture.Common({src:"images/schedule/schedule_skin_atlas.png"}),
    })  
    
    // store the row data entites that need to be updated
    panelInfo.rows.push({
        row: row,
        timeText: timeText,
        titleRoot: titleRoot,
        titleText: titleText,
        companyText: companyText, 
        description: descriptionText,
        liveText: liveText,
        liveHighlight: liveHighlight,
        startsInText: startsInText,
        jumpInButton: jumpInButton,
        rowRoot: rowRoot
    })
}
