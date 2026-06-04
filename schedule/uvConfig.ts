

const margin = 0.005
const margin2 = 0.004
const margin3 = 0.001

export let scheduleConfig:any = {
    
    background:{        
        uvs: [
            
            1/8 + margin,2/8 + margin,
            1/8 + margin,6/8 - margin,
            2/8 - margin,6/8 - margin,
            2/8 - margin,2/8 + margin,

            1/8 + margin,2/8 + margin,
            1/8 + margin,6/8 - margin,
            2/8 - margin,6/8 - margin,
            2/8 - margin,2/8 + margin,           
        ]
    },
    header:{        
        uvs: [
            
            0 + margin,0 + margin,
            0 + margin,1/8 - margin,
            1 - margin,1/8 - margin,
            1 - margin,0 + margin,

            0 + margin,0 + margin,
            0 + margin,1/8 - margin,
            1 - margin,1/8 - margin,
            1 - margin,0 + margin,            
        ]
    },
    decoSide:{        
        uvs: [
            
            0 + margin3,2/8 + margin3,
            0 + margin3,1 - margin3,
            1/8 - margin3,1 - margin3,
            1/8 - margin3,2/8 + margin3,

            0 + margin3,2/8 + margin3,
            0 + margin3,1 - margin3,
            1/8 - margin3,1 - margin3,
            1/8 - margin3,2/8 + margin3,         
        ]
    },
    prevButton:{
        uvs: [
            1/8 + margin2, 6/8 + margin2,
            1/8 + margin2, 7/8 - margin2,
            5/8 - margin2, 7/8 - margin2,
            5/8 - margin2, 6/8 + margin2,

            1/8 + margin2, 6/8 + margin2,
            1/8 + margin2, 7/8 - margin2,
            5/8 - margin2, 7/8 - margin2,
            5/8 - margin2, 6/8 + margin2,
        ]
    },
    nextButton:{
        uvs: [
            1/8 + margin2, 7/8 + margin2,
            1/8 + margin2, 1 - margin2,
            5/8 - margin2, 1 - margin2,
            5/8 - margin2, 7/8 + margin2,

            1/8 + margin2, 7/8 + margin2,
            1/8 + margin2, 1 - margin2,
            5/8 - margin2, 1 - margin2,
            5/8 - margin2, 7/8 + margin2,
        ]
    },
    jumpInButton:{
        uvs: [
            0 + margin2, 1/8 + margin2,
            0 + margin2, 2/8 - margin2,
            1/8 - margin2, 2/8 - margin2,
            1/8 - margin2, 1/8 + margin2,

            0 + margin2, 1/8 + margin2,
            0 + margin2, 2/8 - margin2,
            1/8 - margin2, 2/8 - margin2,
            1/8 - margin2, 1/8 + margin2,
        ]
    }
}
        
    
    