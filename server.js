const express = require('express');
const { WebSocketServer } = require('ws');
const http = require('http');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocketServer({ server });
app.use(express.static(path.join(__dirname, 'public')));

// ── Constants ────────────────────────────────────────────────────
const MAP_W = 3200, MAP_H = 3200;
const TICK_MS = 50;
const PR = 14;
const ZR = 16;
const BR = 4;
const PLAYER_SPEED = 5;
const MAX_HP = 100;
const DAY_DURATION  = 1800;
const NIGHT_DURATION = 1200;
const CYCLE = DAY_DURATION + NIGHT_DURATION;
const ZOMBIE_ATK_CD = 45;

// Day params
const DAY   = { hp:30, spd:1.2, dmg:8,  maxZ:40,  spawnEvery:200, spawnCount:2 };
// Night params
const NIGHT = { hp:60, spd:1.9, dmg:15, maxZ:100, spawnEvery:80,  spawnCount:5 };

// ── Ammo types ───────────────────────────────────────────────────
// Each weapon uses a specific ammo type
const AMMO_TYPES = {
  pistol_ammo:  { name:'Munição Pistola',  color:'#ccc'    },
  shotgun_ammo: { name:'Munição Escopeta', color:'#e17055' },
  rifle_ammo:   { name:'Munição Rifle',    color:'#74b9ff' },
  smg_ammo:     { name:'Munição SMG',      color:'#55efc4' },
  sniper_ammo:  { name:'Munição Sniper',   color:'#fd79a8' },
};

// ── Weapon definitions ───────────────────────────────────────────
const WEAPONS = {
  fists:   { name:'Punhos',   dmg:12, cd:22, range:30, melee:true,  ammoType:null,          magSize:0,  color:'#aaa'    },
  pistol:  { name:'Pistola',  dmg:20, cd:12, spd:16,   ammoType:'pistol_ammo',  magSize:12, color:'#ccc',    spread:0.06  },
  shotgun: { name:'Escopeta', dmg:16, cd:30, spd:12,   ammoType:'shotgun_ammo', magSize:6,  color:'#e17055', spread:0.22, pellets:5 },
  rifle:   { name:'Rifle',    dmg:35, cd:22, spd:22,   ammoType:'rifle_ammo',   magSize:20, color:'#74b9ff', spread:0.02  },
  smg:     { name:'SMG',      dmg:12, cd:5,  spd:17,   ammoType:'smg_ammo',     magSize:35, color:'#55efc4', spread:0.10  },
  sniper:  { name:'Sniper',   dmg:90, cd:65, spd:28,   ammoType:'sniper_ammo',  magSize:5,  color:'#fd79a8', spread:0.003 },
};

// ── Skin definitions ─────────────────────────────────────────────
const SKINS = {
  default: { name:'Padrão',   cost:0,   color:'#dfe6e9' },
  red:     { name:'Vermelho', cost:100, color:'#ff7675' },
  blue:    { name:'Azul',     cost:100, color:'#74b9ff' },
  green:   { name:'Verde',    cost:100, color:'#55efc4' },
  yellow:  { name:'Amarelo',  cost:150, color:'#ffeaa7' },
  purple:  { name:'Roxo',     cost:150, color:'#a29bfe' },
  pink:    { name:'Rosa',     cost:200, color:'#fd79a8' },
  black:   { name:'Preto',    cost:300, color:'#2d3436' },
  gold:    { name:'Ouro',     cost:500, color:'#f0c040' },
};

// ── Map: buildings & trees ───────────────────────────────────────
// Buildings: { x, y, w, h, walls:[], floors:[] }
// walls are solid; floor is the room polygon (for interior detection)
function buildMap() {
  const walls = [];   // { x,y,w,h } solid collision rects
  const trees = [];   // { x, y, r }
  const buildings = []; // { id, x,y,w,h, doorDir, doorOffset }

  const addWall = (x,y,w,h) => walls.push({x,y,w,h});

  // ── Buildings ──────────────────────────────────────────────────
  // Each building: outer walls with a door gap
  // doorDir: 'n','s','e','w'  doorOffset: position along that wall
  const BLDG_DEFS = [
    // Top-left quadrant
    { x:200,  y:200,  w:180, h:140, door:'s', dOff:70  },
    { x:500,  y:150,  w:200, h:160, door:'e', dOff:60  },
    { x:180,  y:500,  w:160, h:200, door:'e', dOff:80  },
    { x:550,  y:480,  w:220, h:180, door:'n', dOff:90  },
    { x:850,  y:200,  w:180, h:160, door:'s', dOff:70  },
    { x:900,  y:500,  w:200, h:180, door:'w', dOff:80  },
    { x:200,  y:850,  w:220, h:160, door:'e', dOff:70  },
    { x:600,  y:800,  w:180, h:200, door:'n', dOff:80  },
    { x:950,  y:820,  w:200, h:160, door:'w', dOff:70  },
    { x:1100, y:200,  w:180, h:200, door:'s', dOff:80  },
    { x:1200, y:600,  w:160, h:180, door:'n', dOff:70  },
    { x:1050, y:1000, w:200, h:160, door:'w', dOff:70  },
    // Top-right quadrant
    { x:1820, y:200,  w:180, h:140, door:'s', dOff:70  },
    { x:2100, y:150,  w:200, h:160, door:'w', dOff:60  },
    { x:2400, y:200,  w:180, h:160, door:'s', dOff:70  },
    { x:1800, y:480,  w:220, h:180, door:'e', dOff:80  },
    { x:2150, y:500,  w:180, h:200, door:'n', dOff:80  },
    { x:2500, y:480,  w:200, h:180, door:'w', dOff:80  },
    { x:2750, y:200,  w:180, h:200, door:'s', dOff:80  },
    { x:1850, y:820,  w:200, h:160, door:'e', dOff:70  },
    { x:2200, y:800,  w:180, h:200, door:'n', dOff:80  },
    { x:2600, y:820,  w:200, h:160, door:'w', dOff:70  },
    { x:2800, y:700,  w:180, h:180, door:'s', dOff:70  },
    { x:1950, y:1050, w:200, h:160, door:'n', dOff:80  },
    // Bottom-left quadrant
    { x:200,  y:1820, w:180, h:140, door:'n', dOff:70  },
    { x:500,  y:1850, w:200, h:160, door:'e', dOff:60  },
    { x:180,  y:2200, w:160, h:200, door:'e', dOff:80  },
    { x:550,  y:2150, w:220, h:180, door:'s', dOff:90  },
    { x:850,  y:1820, w:180, h:160, door:'n', dOff:70  },
    { x:900,  y:2100, w:200, h:180, door:'e', dOff:80  },
    { x:200,  y:2550, w:220, h:160, door:'e', dOff:70  },
    { x:600,  y:2500, w:180, h:200, door:'s', dOff:80  },
    { x:950,  y:2520, w:200, h:160, door:'w', dOff:70  },
    { x:1100, y:1900, w:180, h:200, door:'n', dOff:80  },
    { x:1200, y:2200, w:160, h:180, door:'s', dOff:70  },
    { x:1050, y:2700, w:200, h:160, door:'e', dOff:70  },
    // Bottom-right quadrant
    { x:1820, y:1820, w:180, h:140, door:'n', dOff:70  },
    { x:2100, y:1850, w:200, h:160, door:'w', dOff:60  },
    { x:2400, y:1820, w:180, h:160, door:'n', dOff:70  },
    { x:1800, y:2150, w:220, h:180, door:'e', dOff:80  },
    { x:2150, y:2100, w:180, h:200, door:'s', dOff:80  },
    { x:2500, y:2150, w:200, h:180, door:'w', dOff:80  },
    { x:2750, y:1900, w:180, h:200, door:'n', dOff:80  },
    { x:1850, y:2520, w:200, h:160, door:'e', dOff:70  },
    { x:2200, y:2500, w:180, h:200, door:'s', dOff:80  },
    { x:2600, y:2520, w:200, h:160, door:'w', dOff:70  },
    { x:2800, y:2400, w:180, h:180, door:'n', dOff:70  },
    { x:1950, y:2750, w:200, h:160, door:'s', dOff:80  },
    // Center area — larger buildings
    { x:1380, y:1380, w:240, h:240, door:'n', dOff:100 },
    { x:1380, y:1380, w:240, h:240, door:'s', dOff:100 },
  ];

  const GAP = 40; // door width
  BLDG_DEFS.forEach((b, idx) => {
    const { x, y, w, h, door, dOff } = b;
    const T = 8; // wall thickness
    // Deduplicate center building
    if (idx === BLDG_DEFS.length - 1) return;
    buildings.push({ id: idx, x, y, w, h });

    // Build walls with door gap
    // North wall
    if (door === 'n') {
      addWall(x, y, dOff, T);
      addWall(x+dOff+GAP, y, w-dOff-GAP, T);
    } else { addWall(x, y, w, T); }
    // South wall
    if (door === 's') {
      addWall(x, y+h-T, dOff, T);
      addWall(x+dOff+GAP, y+h-T, w-dOff-GAP, T);
    } else { addWall(x, y+h-T, w, T); }
    // West wall
    if (door === 'w') {
      addWall(x, y, T, dOff);
      addWall(x, y+dOff+GAP, T, h-dOff-GAP);
    } else { addWall(x, y, T, h); }
    // East wall
    if (door === 'e') {
      addWall(x+w-T, y, T, dOff);
      addWall(x+w-T, y+dOff+GAP, T, h-dOff-GAP);
    } else { addWall(x+w-T, y, T, h); }
  });

  // ── Trees ─────────────────────────────────────────────────────
  // Scatter trees avoiding buildings and map center cross
  const rnd = (lo, hi) => Math.random()*(hi-lo)+lo;
  const inBuilding = (tx, ty, r) => buildings.some(b =>
    tx+r > b.x-20 && tx-r < b.x+b.w+20 &&
    ty+r > b.y-20 && ty-r < b.y+b.h+20
  );
  const inCenter = (tx, ty) => tx > 1380 && tx < 1820 && ty > 1380 && ty < 1820;

  for (let i = 0; i < 220; i++) {
    let tx, ty, tries = 0;
    do {
      tx = rnd(60, MAP_W-60);
      ty = rnd(60, MAP_H-60);
      tries++;
    } while (tries < 30 && (inBuilding(tx, ty, 28) || inCenter(tx, ty)));
    if (tries < 30) trees.push({ x: tx, y: ty, r: 18+Math.random()*10 });
  }

  return { walls, trees, buildings };
}

const { walls: WALLS, trees: TREES, buildings: BUILDINGS } = buildMap();

function circleWall(x, y, r) {
  for (const w of WALLS) {
    const cx = Math.max(w.x, Math.min(x, w.x+w.w));
    const cy = Math.max(w.y, Math.min(y, w.y+w.h));
    if ((x-cx)**2+(y-cy)**2 < r*r) return true;
  }
  // Trees as soft obstacles
  for (const t of TREES) {
    if ((x-t.x)**2+(y-t.y)**2 < (r+t.r*0.7)**2) return true;
  }
  return false;
}

function insideBuilding(x, y) {
  return BUILDINGS.find(b => x > b.x+8 && x < b.x+b.w-8 && y > b.y+8 && y < b.y+b.h-8) || null;
}

function dist2(a,b){return (a.x-b.x)**2+(a.y-b.y)**2;}
function dist(a,b){return Math.sqrt(dist2(a,b));}
function rnd(lo,hi){return Math.random()*(hi-lo)+lo;}
let _id=1; function uid(){return _id++;}

// ── State ────────────────────────────────────────────────────────
let players={}, bullets=[], zombies=[], drops=[], gangs={};
let tick=0;

function getDayPhase(){
  const t=tick%CYCLE;
  return {isDay:t<DAY_DURATION, progress:t<DAY_DURATION?t/DAY_DURATION:(t-DAY_DURATION)/NIGHT_DURATION, cycleT:t};
}

function edgePos(){
  const side=Math.floor(Math.random()*4);
  if(side===0)return{x:rnd(0,MAP_W),y:0};
  if(side===1)return{x:MAP_W,y:rnd(0,MAP_H)};
  if(side===2)return{x:rnd(0,MAP_W),y:MAP_H};
  return{x:0,y:rnd(0,MAP_H)};
}
function safePos(margin=150){
  let x,y,t=0;
  do{x=rnd(margin,MAP_W-margin);y=rnd(margin,MAP_H-margin);t++;}
  while(t<40&&circleWall(x,y,PR+4));
  return{x,y};
}

// ── Drops ─────────────────────────────────────────────────────────
const AMMO_DROPS_DAY   = ['pistol_ammo','pistol_ammo','shotgun_ammo','smg_ammo','rifle_ammo'];
const AMMO_DROPS_NIGHT = ['rifle_ammo','sniper_ammo','smg_ammo','shotgun_ammo','pistol_ammo','rifle_ammo'];
const WEAPON_DROPS     = ['pistol','pistol','shotgun','rifle','smg','sniper'];
const ITEM_DROPS_DAY   = ['pistol_ammo','pistol_ammo','smg_ammo','health_sm','health_sm','armor_sm','pistol','shotgun'];
const ITEM_DROPS_NIGHT = ['rifle_ammo','sniper_ammo','smg_ammo','health_lg','health_lg','armor_lg','rifle','smg','sniper'];

function spawnDrop(x,y,type){drops.push({id:uid(),x,y,type});}

function spawnWorldDrops(){
  // Weapons scattered in buildings and around map
  ['pistol','pistol','shotgun','rifle','smg','pistol','shotgun','smg'].forEach(w=>{
    const p=safePos(200); spawnDrop(p.x,p.y,w);
  });
  // Ammo packs around map
  for(let i=0;i<20;i++){
    const p=safePos(100);
    const t=ITEM_DROPS_DAY[Math.floor(Math.random()*ITEM_DROPS_DAY.length)];
    spawnDrop(p.x,p.y,t);
  }
}
spawnWorldDrops();

// Zombie ammo-only drop
function zombieDrop(x,y,isDay){
  if(Math.random()<0.55){
    const table=isDay?AMMO_DROPS_DAY:AMMO_DROPS_NIGHT;
    spawnDrop(x,y,table[Math.floor(Math.random()*table.length)]);
  }
  return isDay?Math.floor(rnd(5,15)):Math.floor(rnd(15,35));
}

// Night world drops
function nightWorldDrop(){
  const p=safePos(100);
  const t=ITEM_DROPS_NIGHT[Math.floor(Math.random()*ITEM_DROPS_NIGHT.length)];
  spawnDrop(p.x,p.y,t);
}

// ── Gangs ─────────────────────────────────────────────────────────
const PRESET_COLORS=['#ff4757','#2ed573','#1e90ff','#ffa502','#fd79a8','#a29bfe','#00cec9','#e17055'];
function createGang(name,color,leaderId){
  const id='g'+uid();
  gangs[id]={id,name:name.slice(0,16),color,leaderId,members:new Set([leaderId]),kills:0,base:null};
  return id;
}
function gangPublic(g){return{i:g.id,n:g.name,c:g.color,k:g.kills,m:g.members.size,base:g.base,lid:g.leaderId};}

// ── Shooting ──────────────────────────────────────────────────────
function fireBullet(owner,angle,wpnKey){
  const wpn=WEAPONS[wpnKey]; if(!wpn||wpn.melee) return;
  const pellets=wpn.pellets||1;
  for(let i=0;i<pellets;i++){
    const sp=(Math.random()-0.5)*wpn.spread*2;
    const a=angle+sp;
    bullets.push({id:uid(),ownerId:owner.id,ownerGangId:owner.gangId,
      x:owner.x,y:owner.y,vx:Math.cos(a)*wpn.spd,vy:Math.sin(a)*wpn.spd,
      ttl:55,dmg:wpn.dmg,color:wpn.color});
  }
}

function broadcast(data){const m=JSON.stringify(data);wss.clients.forEach(c=>{if(c.readyState===1)c.send(m);});}
function sendTo(ws,data){if(ws&&ws.readyState===1)ws.send(JSON.stringify(data));}

// ── Game Loop ─────────────────────────────────────────────────────
setInterval(()=>{
  tick++;
  const {isDay,progress,cycleT}=getDayPhase();
  const Z=isDay?DAY:NIGHT;

  if(cycleT===0)            broadcast({type:'phase',isDay:true, msg:'🌅 AMANHECEU — os zumbis recuam...'});
  if(cycleT===DAY_DURATION) broadcast({type:'phase',isDay:false,msg:'🌙 ANOITECEU — eles vêm em massa!'});
  if(cycleT===DAY_DURATION-200) broadcast({type:'phase',isDay:true,msg:'⚠ A noite se aproxima!'});

  // Zombie spawns
  if(tick%Z.spawnEvery===0&&zombies.length<Z.maxZ&&Object.keys(players).length>0){
    for(let i=0;i<Z.spawnCount;i++){
      const pos=edgePos();
      zombies.push({id:uid(),x:pos.x,y:pos.y,hp:Z.hp,maxHp:Z.hp,speed:Z.spd,dmg:Z.dmg,atkCd:0});
    }
  }

  // Night world drops
  if(!isDay&&tick%300===0) nightWorldDrop();

  const alivePl=Object.values(players).filter(p=>p.hp>0);

  // Zombie AI
  for(const z of zombies){
    if(!alivePl.length) break;
    let target=alivePl[0],best=dist2(z,target);
    for(const p of alivePl){const d=dist2(z,p);if(d<best){best=d;target=p;}}
    if(z.atkCd>0)z.atkCd--;
    if(Math.sqrt(best)<ZR+PR){
      if(z.atkCd===0){
        let dmg=z.dmg;
        if(target.armor>0){const ab=Math.min(target.armor,dmg*.5);target.armor-=ab;dmg-=ab;}
        target.hp=Math.max(0,target.hp-dmg);
        z.atkCd=ZOMBIE_ATK_CD;
        sendTo(target.ws,{type:'hit',hp:target.hp,armor:target.armor});
        if(target.hp===0)broadcast({type:'playerDied',id:target.id,name:target.name,killer:'zombie'});
      }
    }else{
      const ang=Math.atan2(target.y-z.y,target.x-z.x);
      const nx=z.x+Math.cos(ang)*z.speed,ny=z.y+Math.sin(ang)*z.speed;
      if(!circleWall(nx,z.y,ZR)&&nx>0&&nx<MAP_W)z.x=nx;
      if(!circleWall(z.x,ny,ZR)&&ny>0&&ny<MAP_H)z.y=ny;
    }
  }

  // Bullets
  bullets=bullets.filter(b=>{
    b.x+=b.vx;b.y+=b.vy;b.ttl--;
    if(b.ttl<=0||b.x<0||b.x>MAP_W||b.y<0||b.y>MAP_H)return false;
    if(circleWall(b.x,b.y,BR))return false;
    // Hit zombies
    for(let i=zombies.length-1;i>=0;i--){
      const z=zombies[i];
      if(dist2(b,z)<(BR+ZR)**2){
        z.hp-=b.dmg;
        if(z.hp<=0){
          const money=zombieDrop(z.x,z.y,isDay);
          zombies.splice(i,1);
          const owner=players[b.ownerId];
          if(owner){owner.money+=money;owner.kills++;if(owner.gangId&&gangs[owner.gangId])gangs[owner.gangId].kills++;sendTo(owner.ws,{type:'reward',money,total:owner.money});}
        }
        return false;
      }
    }
    // PvP
    for(const p of alivePl){
      if(p.id===b.ownerId)continue;
      if(b.ownerGangId&&p.gangId&&b.ownerGangId===p.gangId)continue;
      if(dist2(b,p)<(BR+PR)**2){
        let dmg=b.dmg;
        if(p.armor>0){const ab=Math.min(p.armor,dmg*.4);p.armor-=ab;dmg-=ab;}
        p.hp=Math.max(0,p.hp-dmg);
        sendTo(p.ws,{type:'hit',hp:p.hp,armor:p.armor});
        if(p.hp===0){
          const killer=players[b.ownerId];
          broadcast({type:'playerDied',id:p.id,name:p.name,killer:killer?killer.name:'Desconhecido'});
          if(killer){killer.kills++;killer.money+=50;sendTo(killer.ws,{type:'reward',money:50,total:killer.money,pvp:true});}
        }
        return false;
      }
    }
    return true;
  });

  // Players
  for(const p of Object.values(players)){
    if(p.hp<=0)continue;
    let dx=0,dy=0;
    if(p.keys.up)dy-=1;if(p.keys.down)dy+=1;if(p.keys.left)dx-=1;if(p.keys.right)dx+=1;
    if(dx&&dy){dx*=0.707;dy*=0.707;}
    const nx=Math.max(PR,Math.min(MAP_W-PR,p.x+dx*PLAYER_SPEED));
    const ny=Math.max(PR,Math.min(MAP_H-PR,p.y+dy*PLAYER_SPEED));
    if(!circleWall(nx,p.y,PR))p.x=nx;
    if(!circleWall(p.x,ny,PR))p.y=ny;

    // Track building
    p.insideBuildingId = insideBuilding(p.x,p.y)?.id ?? null;

    // Gang base regen
    if(p.gangId&&gangs[p.gangId]?.base){
      const base=gangs[p.gangId].base;
      if(dist({x:p.x,y:p.y},base)<base.r&&tick%25===0&&p.hp<MAX_HP){
        p.hp=Math.min(MAX_HP,p.hp+1);
        sendTo(p.ws,{type:'regen',hp:p.hp});
      }
    }

    // Pick up drops (auto for consumables, F for weapons)
    for(let i=drops.length-1;i>=0;i--){
      const d=drops[i];
      const dd=dist2({x:p.x,y:p.y},{x:d.x,y:d.y});
      if(dd>(PR+16)**2)continue;

      // Weapon drop — prompt
      if(WEAPONS[d.type]){
        if(p.pendingPickup!==d.id){
          p.pendingPickup=d.id;
          sendTo(p.ws,{type:'nearWeapon',dropId:d.id,weapon:d.type,name:WEAPONS[d.type].name});
        }
        continue;
      }

      // Ammo
      if(d.type.endsWith('_ammo')){
        p.ammoInv[d.type]=(p.ammoInv[d.type]||0)+20;
        sendTo(p.ws,{type:'pickup',item:d.type,val:20,ammoInv:p.ammoInv});
        drops.splice(i,1);continue;
      }
      if(d.type==='health_sm'){p.hp=Math.min(MAX_HP,p.hp+25);sendTo(p.ws,{type:'pickup',item:'health',val:25,hp:p.hp});drops.splice(i,1);continue;}
      if(d.type==='health_lg'){p.hp=Math.min(MAX_HP,p.hp+60);sendTo(p.ws,{type:'pickup',item:'health',val:60,hp:p.hp});drops.splice(i,1);continue;}
      if(d.type==='armor_sm'){p.armor=Math.min(100,p.armor+25);sendTo(p.ws,{type:'pickup',item:'armor',val:25,armor:p.armor});drops.splice(i,1);continue;}
      if(d.type==='armor_lg'){p.armor=Math.min(100,p.armor+50);sendTo(p.ws,{type:'pickup',item:'armor',val:50,armor:p.armor});drops.splice(i,1);continue;}
    }
    // Clear pending pickup if walked away
    if(p.pendingPickup){
      const d=drops.find(d=>d.id===p.pendingPickup);
      if(!d||dist2({x:p.x,y:p.y},{x:d.x,y:d.y})>(PR+32)**2){p.pendingPickup=null;sendTo(p.ws,{type:'clearPickup'});}
    }

    // Shoot
    if(p.wantShoot&&p.shootCd===0){
      const wpn=WEAPONS[p.weapon]||WEAPONS.fists;
      if(wpn.melee){
        for(let i=zombies.length-1;i>=0;i--){
          const z=zombies[i];
          if(dist2({x:p.x,y:p.y},z)<(wpn.range+ZR)**2){
            z.hp-=wpn.dmg;
            if(z.hp<=0){const money=zombieDrop(z.x,z.y,isDay);zombies.splice(i,1);p.money+=money;p.kills++;if(p.gangId&&gangs[p.gangId])gangs[p.gangId].kills++;sendTo(p.ws,{type:'reward',money,total:p.money});}
          }
        }
        p.shootCd=wpn.cd;
      } else {
        const ammoType=wpn.ammoType;
        const available=p.ammoInv[ammoType]||0;
        if(available>0){
          fireBullet(p,p.aimAngle,p.weapon);
          p.ammoInv[ammoType]=available-1;
          p.shootCd=wpn.cd;
          sendTo(p.ws,{type:'ammoUpdate',ammoInv:p.ammoInv});
        } else {
          sendTo(p.ws,{type:'noAmmo',weapon:p.weapon});
        }
      }
      p.wantShoot=false;
    }
    if(p.shootCd>0)p.shootCd--;
  }

  // Broadcast
  const phase=getDayPhase();
  broadcast({
    type:'S',tick,day:phase.isDay,dayProg:phase.progress,
    P:Object.values(players).map(p=>({
      i:p.id,n:p.name,x:Math.round(p.x),y:Math.round(p.y),
      h:p.hp,a:p.armor,g:p.gangId,sk:p.skin,w:p.weapon,k:p.kills,
      aim:+(p.aimAngle||0).toFixed(2),bld:p.insideBuildingId
    })),
    Z:zombies.map(z=>({i:z.id,x:Math.round(z.x),y:Math.round(z.y),h:z.hp,m:z.maxHp})),
    B:bullets.map(b=>({i:b.id,x:Math.round(b.x),y:Math.round(b.y),c:b.color})),
    D:drops.map(d=>({i:d.id,x:Math.round(d.x),y:Math.round(d.y),t:d.type})),
    G:Object.values(gangs).map(gangPublic),
  });
},TICK_MS);

// ── WebSocket ─────────────────────────────────────────────────────
wss.on('connection',ws=>{
  const id='p'+uid();
  const sp=safePos(200);
  const player={
    id,ws,name:'Jogador',x:sp.x,y:sp.y,hp:MAX_HP,armor:0,
    money:0,kills:0,gangId:null,skin:'default',weapon:'fists',
    ammoInv:{},
    keys:{up:false,down:false,left:false,right:false},
    aimAngle:0,wantShoot:false,shootCd:0,pendingPickup:null,
    insideBuildingId:null,
    unlockedSkins:['default'],
  };
  players[id]=player;

  sendTo(ws,{
    type:'init',id,mapW:MAP_W,mapH:MAP_H,
    walls:WALLS,trees:TREES,buildings:BUILDINGS,
    weapons:WEAPONS,skins:SKINS,ammoTypes:AMMO_TYPES,
    hp:MAX_HP,ammoInv:{},armor:0,money:0,
    gangs:Object.values(gangs).map(gangPublic),
  });
  broadcast({type:'playerJoined',id,name:player.name});

  ws.on('message',raw=>{
    try{
      const msg=JSON.parse(raw);
      const p=players[id]; if(!p)return;

      if(msg.type==='name'){p.name=msg.name.slice(0,16);}

      if(msg.type==='input'){
        if(msg.keys)p.keys=msg.keys;
        if(msg.aim!==undefined)p.aimAngle=msg.aim;
        if(msg.shoot)p.wantShoot=true;
      }

      if(msg.type==='pickupWeapon'){
        const d=drops.find(d=>d.id===msg.dropId&&WEAPONS[d.type]);
        if(!d||dist2({x:p.x,y:p.y},{x:d.x,y:d.y})>(PR+38)**2)return;
        // Drop current weapon
        if(p.weapon!=='fists'){
          drops.push({id:uid(),x:p.x+rnd(-18,18),y:p.y+rnd(-18,18),type:p.weapon});
        }
        p.weapon=d.type;
        drops.splice(drops.indexOf(d),1);
        p.pendingPickup=null;
        sendTo(ws,{type:'weaponPickedUp',weapon:d.type,name:WEAPONS[d.type].name,ammoInv:p.ammoInv});
      }

      if(msg.type==='createGang'){
        if(p.gangId){const old=gangs[p.gangId];if(old){old.members.delete(id);if(old.members.size===0)delete gangs[old.id];}}
        const color=msg.color||PRESET_COLORS[Math.floor(Math.random()*PRESET_COLORS.length)];
        const gid=createGang(msg.name||'Gangue',color,id);
        const bx=Math.max(160,Math.min(MAP_W-160,p.x));
        const by=Math.max(160,Math.min(MAP_H-160,p.y));
        gangs[gid].base={x:bx,y:by,r:120};
        p.gangId=gid;
        sendTo(ws,{type:'gangCreated',gangId:gid,gang:gangPublic(gangs[gid])});
        broadcast({type:'gangUpdate',gangs:Object.values(gangs).map(gangPublic)});
      }

      if(msg.type==='joinGang'){
        const g=gangs[msg.gangId];if(!g)return;
        if(p.gangId){const old=gangs[p.gangId];if(old){old.members.delete(id);if(old.members.size===0)delete gangs[old.id];}}
        p.gangId=msg.gangId;g.members.add(id);
        sendTo(ws,{type:'gangJoined',gangId:msg.gangId,gangName:g.name,gangColor:g.color,base:g.base});
        broadcast({type:'gangUpdate',gangs:Object.values(gangs).map(gangPublic)});
      }

      if(msg.type==='leaveGang'){
        if(!p.gangId)return;
        const g=gangs[p.gangId];
        if(g){g.members.delete(id);if(g.members.size===0)delete gangs[g.id];}
        p.gangId=null;
        sendTo(ws,{type:'gangLeft'});
        broadcast({type:'gangUpdate',gangs:Object.values(gangs).map(gangPublic)});
      }

      if(msg.type==='buySkin'){
        const s=SKINS[msg.skin];if(!s)return;
        if(!p.unlockedSkins.includes(msg.skin)){
          if(p.money<s.cost){sendTo(ws,{type:'err',msg:'Dinheiro insuficiente'});return;}
          p.money-=s.cost;p.unlockedSkins.push(msg.skin);
        }
        p.skin=msg.skin;
        sendTo(ws,{type:'skinBought',skin:msg.skin,money:p.money,unlockedSkins:p.unlockedSkins});
      }
      if(msg.type==='equipSkin'){if(p.unlockedSkins.includes(msg.skin)){p.skin=msg.skin;sendTo(ws,{type:'skinEquipped',skin:msg.skin});}}

      if(msg.type==='respawn'&&p.hp<=0){
        p.hp=MAX_HP;p.armor=0;p.ammoInv={};p.weapon='fists';
        if(p.gangId&&gangs[p.gangId]?.base){const b=gangs[p.gangId].base;p.x=b.x+rnd(-50,50);p.y=b.y+rnd(-50,50);}
        else{const sp2=safePos(200);p.x=sp2.x;p.y=sp2.y;}
        sendTo(ws,{type:'respawned',hp:p.hp,ammoInv:p.ammoInv,armor:p.armor,weapon:p.weapon});
      }

      if(msg.type==='disconnect'){
        // Clean leave (back to menu)
        if(p.gangId&&gangs[p.gangId]){gangs[p.gangId].members.delete(id);if(gangs[p.gangId].members.size===0)delete gangs[p.gangId];}
        delete players[id];
        broadcast({type:'playerLeft',id});
        ws.close();
      }
    }catch(e){console.error(e);}
  });

  ws.on('close',()=>{
    const p=players[id];
    if(p?.gangId&&gangs[p.gangId]){gangs[p.gangId].members.delete(id);if(gangs[p.gangId].members.size===0)delete gangs[p.gangId];}
    delete players[id];
    broadcast({type:'playerLeft',id});
  });
});

const PORT=process.env.PORT||3000;
server.listen(PORT,()=>console.log(`☣ Dead Zone v4 :${PORT}`));
