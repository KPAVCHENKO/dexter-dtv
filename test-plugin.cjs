'use strict';
const fs = require('fs');
const vm = require('vm');
const assert = require('node:assert/strict');
const plugin = fs.readFileSync(__dirname + '/dexter-dtv.js', 'utf8');
const storage = {'dexter_dtv_s1_e1':'https://cdn.example.org/show/s01e01/manifest.m3u8'};
let active = 'full';
let activeMenu = null;
let launched = null;
let playlist = null;
let input = null;
let addButton = null;
const button = {length:1, on:function(type,cb){ if(type==='hover:enter') addButton=cb; return this; }};
const root = {find:function(sel){
  if(sel.includes('dexter-dtv-launcher'))return {length:0};
  if(sel.includes('buttons'))return {length:1,first(){return this;},prepend(){}};
  return {length:0};
}};
function $(html){if(html[0]==='<')return button;return {length:0,first(){return this;}};}
const ctrl={
  enabled:()=>({name:active}),
  toggle:(name)=>{active=name;},
  collectionFocus:()=>{}
};
const context={window:{},document:{documentElement:{contains:()=>false}},console,
  setTimeout:(fn)=>{fn();}, XMLHttpRequest:function(){}, $};
context.window.Lampa=context.Lampa={
 Noty:{show:()=>{}}, Storage:{get:(k,d)=>storage[k]||d,set:(k,v)=>storage[k]=v},
 Controller:ctrl,
 Listener:{follow:(name,fn)=>{if(name==='full') context.fullFn=fn;}},
 Select:{show:(m)=>{activeMenu=m;active='select';},close:()=>{active='select';const fn=activeMenu.onBack;fn();}},
 Input:{edit:(config,fn)=>{input={config,fn};}},
 Player:{play:(item)=>launched=item,playlist:(list)=>playlist=list}
};
vm.runInNewContext(plugin,context);
assert.equal(typeof context.fullFn,'function','plugin registered full listener');
context.fullFn({type:'complite',data:{movie:{original_name:'Dexter',first_air_date:'2006-10-01'}},object:{activity:{render:()=>root}}});
assert.equal(typeof addButton,'function','Dexter button injected');
addButton();
assert.equal(active,'select');
activeMenu.onBack();assert.equal(active,'full','Back restores original controller');
active='full';addButton();
const first=activeMenu.items.find(x=>x.episode===1);
active='select';activeMenu.onSelect(first);
assert.equal(active,'full','Episode selection restores original controller');
assert.equal(launched.url,storage.dexter_dtv_s1_e1,'v0.1 URLs preserved');
assert.equal(playlist.length,1,'playlist built from only valid URLs');
active='full';addButton();
const second=activeMenu.items.find(x=>x.episode===2);
activeMenu.onSelect(second);
assert.equal(active,'full','Input launched after controller restoration');
assert.ok(input,'input shown for missing episode');
input.fn('');assert.equal(active,'full','Cancel input does not strand remote');
active='full';addButton();
activeMenu.onLong(second);
assert.equal(active,'full','Long-OK editor restores controller');
assert.ok(input,'long-OK editor opens');
assert.equal(storage.dexter_dtv_s1_e1,'https://cdn.example.org/show/s01e01/manifest.m3u8');
console.log('PASS: listener + button; Back restores full; selection restores full; old storage preserved; playback playlist; cancel input; long-OK edit');
