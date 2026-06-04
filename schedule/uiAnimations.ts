import { EasingFunction, engine, Transform, Tween } from "@dcl/sdk/ecs"
import { SchedulePanel } from "./schedulePanel"
import { Vector3 } from "@dcl/sdk/math"

export function animateScrollRow( directionUp:boolean) {

    let panelGroup = engine.getEntitiesWith(SchedulePanel)
    for( let [panelEntity, panelInfo] of panelGroup){
        let panelInfo = SchedulePanel.get(panelEntity)

        for(let i = 0; i < panelInfo.rows.length; i++){
            let row = panelInfo.rows[i]

            if(!row){
                continue
            }

            //reset transform of unfinished tweens
            Transform.getMutable(row.rowRoot).scale = Vector3.create(1, 1, 1)
            Transform.getMutable(row.rowRoot).position = Vector3.create(0, 0.36 - i * 1/4    , 0)

            // scrolling up scales the new first row, moves the rest down
            if(directionUp && i == 0){
                Tween.createOrReplace(row.rowRoot, {
                    duration:  200,
                    easingFunction: EasingFunction.EF_EASEOUTQUAD,
                    currentTime: 0,
                    playing: true,
                    mode: Tween.Mode.Scale({
                        start: Vector3.create(0.5, 0.2, 0.2),
                        end:  Vector3.One(), 
                    }),
                })     
                continue
            } 
            // scrolling down scales the new last row, moves the rest up
            if(!directionUp && i == panelInfo.rows.length-1){
                Tween.createOrReplace(row.rowRoot, {
                    duration:  200,
                    easingFunction: EasingFunction.EF_EASEOUTQUAD,
                    currentTime: 0,
                    playing: true,
                    mode: Tween.Mode.Scale({
                        start: Vector3.create(0.5, 0.2, 0.2),
                        end:  Vector3.One(), 
                    }),
                })     
                continue
            }

            // scrolling up moves the rest down, scrolling down moves the rest up            
            let offset = directionUp ? -1 : 1
            let rowTransform = Transform.get(row.rowRoot)
            Tween.createOrReplace(row.rowRoot, {
                duration:  200,
                easingFunction: EasingFunction.EF_EASEOUTQUAD,
                currentTime: 0,
                playing: true,
                mode: Tween.Mode.Move({
                    start: Vector3.create(0, 0.36 - (i+offset) * 1/4, 0),
                    end:  Vector3.create(0, 0.36 - i * 1/4    , 0), 
                }),
            })         
            
        
        
        }
    }
}


export function animateNoMoreScroll( directionUp:boolean) {
    let panelGroup = engine.getEntitiesWith(SchedulePanel)
    for( let [panelEntity, panelInfo] of panelGroup){
        let panelInfo = SchedulePanel.get(panelEntity)

        for(let i = 0; i < panelInfo.rows.length; i++){
            let row = panelInfo.rows[i]

            if(!row){
                continue
            }
            //reset transform of unfinished tweens
            Transform.getMutable(row.rowRoot).scale = Vector3.create(1, 1, 1)
            Transform.getMutable(row.rowRoot).position = Vector3.create(0, 0.36 - i * 1/4    , 0)
            
            let offset = directionUp ? 0.1 : -0.1            
            Tween.createOrReplace(row.rowRoot, {
                duration:  400,
                easingFunction: EasingFunction.EF_EASEOUTCUBIC,
                currentTime: 0,
                playing: true,
                mode: Tween.Mode.Move({
                    start: Vector3.create(0, 0.36 - (i+offset) * 1/4, 0),
                    end:  Vector3.create(0, 0.36 - i * 1/4    , 0), 
                }),
            })       
        }
    }
}
