/**
 * @file Registry of all procedural material generators (worker-safe).
 */
import hogwartsStone from './hogwartsStone.js';
import cobblestone from './cobblestone.js';
import flagstone from './flagstone.js';
import marble from './marble.js';
import rock from './rock.js';
import woodPlanks from './woodPlanks.js';
import woodParquet from './woodParquet.js';
import bark from './bark.js';
import books from './books.js';
import leather from './leather.js';
import robeFabric from './robeFabric.js';
import tapestry from './tapestry.js';
import carpet from './carpet.js';
import brass from './brass.js';
import wroughtIron from './wroughtIron.js';
import rust from './rust.js';
import stainedGlass from './stainedGlass.js';
import grass from './grass.js';
import dirt from './dirt.js';
import mud from './mud.js';
import leaves from './leaves.js';
import water from './water.js';
import skin from './skin.js';
import hair from './hair.js';
import parchment from './parchment.js';
import waxSeal from './waxSeal.js';
import candleFlame from './candleFlame.js';
import magicTrail from './magicTrail.js';
import magicInk from './magicInk.js';
import ghost from './ghost.js';

/** @type {Record<string, {id:string, label:string, category:string, variants?:string[], tiling?:boolean,
 *   normalStrength?:number, aoStrength?:number, aoRadius?:number, generate:(ctx:any)=>void}>} */
export const GENERATORS = Object.fromEntries(
  [
    hogwartsStone, cobblestone, flagstone, marble, rock,
    woodPlanks, woodParquet, bark,
    books, leather, robeFabric, tapestry, carpet,
    brass, wroughtIron, rust,
    stainedGlass,
    grass, dirt, mud, leaves, water,
    skin, hair,
    parchment, waxSeal,
    candleFlame, magicTrail, magicInk, ghost,
  ].map((g) => [g.id, g]),
);
