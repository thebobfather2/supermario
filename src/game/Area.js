import * as _Linker from "./Linker"
// import { GeoRendererInstance as GeoRenderer } from "../engine/GeoRenderer"
// import { SurfaceLoadInstance as SurfaceLoad } from "./SurfaceLoad"
// import { ObjectListProcessorInstance as ObjectListProc } from "./ObjectListProcessor"
// import { GameInstance as Game } from "./Game"
import { GEO_CONTEXT_AREA_LOAD, GEO_CONTEXT_AREA_UNLOAD, GEO_CONTEXT_AREA_INIT, geo_call_global_function_nodes } from "../engine/graph_node"
import { gSPViewport } from "../include/gbi"
import { render_screen_transition } from "./ScreenTransition"
import { HudInstance as Hud } from "./Hud"
import { PrintInstance as Print } from "./Print"
import { SCREEN_WIDTH } from "../include/config"
import { oBehParams, ACTIVE_FLAG_DEACTIVATED } from "../include/object_constants"

export const WARP_TRANSITION_FADE_FROM_COLOR   = 0x00
export const WARP_TRANSITION_FADE_INTO_COLOR   = 0x01
export const WARP_TRANSITION_FADE_FROM_STAR    = 0x08
export const WARP_TRANSITION_FADE_INTO_STAR    = 0x09
export const WARP_TRANSITION_FADE_FROM_CIRCLE  = 0x0A
export const WARP_TRANSITION_FADE_INTO_CIRCLE  = 0x0B
export const WARP_TRANSITION_FADE_FROM_MARIO   = 0x10
export const WARP_TRANSITION_FADE_INTO_MARIO   = 0x11
export const WARP_TRANSITION_FADE_FROM_BOWSER  = 0x12
export const WARP_TRANSITION_FADE_INTO_BOWSER  = 0x13

const D_8032CF00 = {  /// default view port?
    vscale: [640, 480, 511, 0],
    vtrans: [640, 480, 511, 0]
}

const canvas = document.querySelector('#gameCanvas')

class Area {
    constructor() {
        this.gCurrentArea = null
        this.gAreas = Array(8).fill(0).map(() => { return { index: 0 } })
        this.gCurAreaIndex = 0
        this.gCurrLevelNum = 0
        this.gCurrCourseNum = 0
        this.gSavedCourseNum = 0
        this.gCurrSaveFileNum = 1
        this.gLoadedGraphNodes = new Array(256)

        this.D_8032CE74 = null
        this.D_8032CE78 = null

        this.gMarioSpawnInfo = {
            startPos: [0, 0, 0],
            startAngle: [0, 0, 0],
            areaIndex: 0, activeAreaIndex: 0,
            behaviorArg: 0, behaviorScript: null,
            unk18: null,
            next: null
        }

        this.gWarpTransition = {
            data: {}
        }
        this.gWarpTransDelay = 0
        this.gFBSetColor = 0
        this.gWarpTransFBSetColor = 0
        this.gWarpTransRed = 0
        this.gWarpTransGreen = 0
        this.gWarpTransBlue = 0

    }

    area_get_warp_node(id) {
        return this.gCurrentArea.warpNodes[id]
    }

    area_get_warp_node_from_params(o) {
        let warp_id = (o.rawData[oBehParams] & 0x00FF0000) >> 16
        return this.area_get_warp_node(warp_id)
    }

    load_obj_warp_nodes() {
        for (const node of gLinker.GeoLayout.gObjParentGraphNode.children) {
            let object = node.object

            if (object.activeFlags != ACTIVE_FLAG_DEACTIVATED && gLinker.LevelUpdate.get_mario_spawn_type(object) != 0) {
                let warp_node = this.area_get_warp_node_from_params(object)
                if (warp_node) {
                    warp_node.object = object
                }
            }
        }
    }

    clear_area_graph_nodes() {
        if (this.gCurrentArea) {
            geo_call_global_function_nodes(this.gCurrentArea.geometryLayoutData, GEO_CONTEXT_AREA_UNLOAD)
            this.gCurrentArea = null
            this.gWarpTransition.isActive = 0
        }

        this.gAreas.forEach((areaData) => {
            if (areaData.geometryLayoutData) {
                geo_call_global_function_nodes(areaData.geometryLayoutData, GEO_CONTEXT_AREA_INIT)
                areaData.geometryLayoutData = null
            }
        })
    }

    load_area(index) {
        if (!this.gCurrentArea && this.gAreas[index].geometryLayoutData) {
            this.gCurrentArea = this.gAreas[index]
            this.gCurAreaIndex = this.gCurrentArea.index

            if (this.gCurrentArea.terrainData) {
                gLinker.SurfaceLoad.load_area_terrain(index, this.gCurrentArea.terrainData, this.gCurrentArea.surfaceRooms, this.gCurrentArea.macroObjects)
            }

            if (this.gCurrentArea.objectSpawnInfos) {
                gLinker.ObjectListProcessor.spawn_objects_from_info(this.gCurrentArea.objectSpawnInfos)
            }

            this.load_obj_warp_nodes()
            geo_call_global_function_nodes(this.gCurrentArea.geometryLayoutData, GEO_CONTEXT_AREA_LOAD)
        }
    }

    unload_area() {
        if (this.gCurrentArea) {
            gLinker.ObjectListProcessor.unload_objects_from_area(this.gCurrentArea.index)
            geo_call_global_function_nodes(this.gCurrentArea.geometryLayoutData, GEO_CONTEXT_AREA_UNLOAD)

            this.gCurrentArea.flags = 0
            this.gCurrentArea = null
            this.gWarpTransition.isActive = 0
        }
    }

    load_mario_area() {
        this.load_area(this.gMarioSpawnInfo.areaIndex)

        if (this.gCurrentArea.index == this.gMarioSpawnInfo.areaIndex) {
            this.gCurrentArea.flags |= 0x01
            gLinker.ObjectListProcessor.spawn_objects_from_info(this.gMarioSpawnInfo)
/*            const marioCloneSpawnInfo = this.gMarioSpawnInfo
            marioCloneSpawnInfo.startPos[0] -= 500
            gLinker.ObjectListProcessor.spawn_objects_from_info(marioCloneSpawnInfo)*/
        }
    }

    unload_mario_area() {
        if (this.gCurrentArea && (this.gCurrentArea.flags & 0x01)) {
            gLinker.ObjectListProcessor.unload_objects_from_area(this.gMarioSpawnInfo.activeAreaIndex)

            this.gCurrentArea.flags &= ~0x01
            if (this.gCurrentArea.flags == 0) {
                this.unload_area()
            }
        }
    }

    area_update_objects() {
        gLinker.GeoRenderer.gAreaUpdateCounter++
        gLinker.ObjectListProcessor.update_objects(0)
    }

    override_viewport_and_clip(a, b, c, d, e) {
        let sp6 = ((c >> 3) << 11) | ((d >> 3) << 6) | ((e >> 3) << 1) | 1

        this.gFBSetColor = (sp6 << 16) | sp6
        this.D_8032CE74 = a
        this.D_8032CE78 = b
    }

    set_warp_transition_rgb(red, green, blue) {
        const warpTransitionRGBA16 = ((red >> 3) << 11) | ((green >> 3) << 6) | ((blue >> 3) << 1) | 1 

        this.gWarpTransFBSetColor = (warpTransitionRGBA16 << 16) | warpTransitionRGBA16
        this.gWarpTransRed = red
        this.gWarpTransGreen = green
        this.gWarpTransBlue = blue
    }

    play_transition(transType, time, red, green, blue) {
        this.gWarpTransition.isActive = 1
        this.gWarpTransition.type = transType
        this.gWarpTransition.time = time
        this.gWarpTransition.pauseRendering = false

        // The lowest bit of transType determines if the transition is fading in or out.
        if (transType & 1) {
            this.set_warp_transition_rgb(red, green, blue)
        } else {
            red = this.gWarpTransRed; green = this.gWarpTransGreen; blue = this.gWarpTransBlue
        }

        if (transType < 8) { // if transition is RGB
            this.gWarpTransition.data.red = red
            this.gWarpTransition.data.green = green
            this.gWarpTransition.data.blue = blue
        } else {
            this.gWarpTransition.data.red = red
            this.gWarpTransition.data.green = green
            this.gWarpTransition.data.blue = blue

            // Both the start and end textured transition are always located in the middle of the screen.
            // If you really wanted to, you could place the start at one corner and the end at
            // the opposite corner. This will make the transition image look like it is moving
            // across the screen.
            this.gWarpTransition.data.startTexX = canvas.width / 2 / 2
            this.gWarpTransition.data.startTexY = canvas.height / 2 / 2
            this.gWarpTransition.data.endTexX = canvas.width / 2 / 2
            this.gWarpTransition.data.endTexY = canvas.height / 2 / 2

            this.gWarpTransition.data.texTimer = 0

            if (transType & 1) { // fading in
                this.gWarpTransition.data.startTexRadius = canvas.width / 2
                if (transType >= 0x0F) {
                    this.gWarpTransition.data.endTexRadius = 16
                } else {
                    this.gWarpTransition.data.endTexRadius = 0
                }
            } else { // fading out
                if (transType >= 0x0E) {
                    this.gWarpTransition.data.startTexRadius = 16
                } else {
                    this.gWarpTransition.data.startTexRadius = 0
                }
                this.gWarpTransition.data.endTexRadius = canvas.width / 2
            }
        }
    }

    clear_areas() {
        this.gCurrentArea = null
        this.gWarpTransition.isActive = 0
        this.gWarpTransition.pauseRendering = 0
        this.gMarioSpawnInfo.areaIndex = -1

        this.gAreas.forEach((areaData, i) => {
            Object.assign(areaData, {
                index: i,
                flags: 0,
                terrainType: 0,
                geometryLayoutData: null,
                terrainData: null,
                surfaceRooms: null,
                macroObjects: null,
                warpNodes: [],
                paintingWarpNodes: [],
                instantWarps: [],
                objectSpawnInfos: null,
                camera: null,
                unused28: null,
                whirlpools: [ null, null ],
                dialog: [null, null],
                musicParam: 0,
                musicParam2: 0
            })
        })
    }


    render_game() {
        if (this.gCurrentArea && !this.gWarpTransition.pauseRendering) {
            gLinker.GeoRenderer.geo_process_root(this.gCurrentArea.geometryLayoutData, this.D_8032CE74, this.D_8032CE78, this.gFBSetColor)

            gSPViewport(gLinker.Game.gDisplayList, D_8032CF00)
            Hud.render_hud()
            Print.render_text_labels()
            // do_cutscene_handler();
            // print_displaying_credits_entry();

            // gPauseScreenMode = render_menus_and_dialogs();

            // if (gPauseScreenMode != 0) {
            //     gSaveOptSelectIndex = gPauseScreenMode;
            // }

            // if (D_8032CE78 != NULL) {
            //     make_viewport_clip_rect(D_8032CE78);
            // } else
            //     gDPSetScissor(gDisplayListHead++, G_SC_NON_INTERLACE, 0, BORDER_HEIGHT, SCREEN_WIDTH,
            //                   SCREEN_HEIGHT - BORDER_HEIGHT);

            if (this.gWarpTransition.isActive) {
                if (this.gWarpTransDelay == 0) {

                    this.gWarpTransition.isActive = !render_screen_transition(0, this.gWarpTransition.type, this.gWarpTransition.time, this.gWarpTransition.data)

                    if (!this.gWarpTransition.isActive) {
                        if (this.gWarpTransition.type & 1) {
                            this.gWarpTransition.pauseRendering = true
                        } else {
                            this.set_warp_transition_rgb(0, 0, 0)
                        }
                    }
                } else {
                    this.gWarpTransDelay--
                }
            }
        } else {
            Print.render_text_labels()
            if (this.D_8032CE78) {
                gLinker.Game.clear_viewport(this.D_8032CE78, this.gWarpTransFBSetColor)
            } else {
                gLinker.Game.clear_frame_buffer(this.gWarpTransFBSetColor)
            }
        }

        this.D_8032CE74 = null
        this.D_8032CE78 = null
    }

    print_intro_text() {
        if ((window.gGlobalTimer & 0x1F) < 20) {
            var noController = false; // gControllerBits == 0

            if (noController) {
                Print.print_text_centered(SCREEN_WIDTH / 2, 20, "NO CONTROLLER");
            } else {
                Print.print_text_centered(60, 38, "PRESS");
                Print.print_text_centered(60, 20, "START");
            }
        }
    }
        

}

export const AreaInstance = new Area()
gLinker.Area = AreaInstance
