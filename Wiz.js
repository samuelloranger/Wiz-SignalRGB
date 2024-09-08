import udp from "@SignalRGB/udp";
export function Name() { return "Wiz"; }
export function Version() { return "1.0.0"; }
export function Type() { return "network"; }
export function Publisher() { return "samuelloranger@gmail.com"; }
export function Size() { return [22, 1]; }
export function DefaultPosition() {return [75, 70]; }
export function DefaultScale(){return 8.0;}
/* global
controller:readonly
discovery: readonly
TurnOffOnShutdown:readonly
variableLedCount:readonly
LightingMode:readonly
forcedColor:readonly
*/
export function ControllableParameters() {
	return [
		{"property":"TurnOffOnShutdown", "group":"settings", "label":"Turn off on App Exit", "type":"boolean", "default":"false"},
		{"property":"LightingMode", "group":"lighting", "label":"Lighting Mode", "type":"combobox", "values":["Canvas", "Forced"], "default":"Canvas"},
		{"property":"forcedColor", "group":"lighting", "label":"Forced Color", "min":"0", "max":"360", "type":"color", "default":"#009bde"},
	];
}

export function SubdeviceController() { return false; }

/** @type {WizProtocol} */
let wiz;
let ledCount = 4;
let ledNames = [];
let ledPositions = [];
let subdevices = [];

export function Initialize(){
	device.addFeature("base64");

	device.setName(controller.sku);
	device.setImageFromUrl(controller.deviceImage);

	if(UDPServer !== undefined) {
		UDPServer.stop();
		UDPServer = undefined;
	}
	//Make sure we don't have a server floating around still.

	UDPServer = new UdpSocketServer({
		ip : controller.ip,
		broadcastPort : 4003,
		listenPort : 4002
	});

	UDPServer.start();
	//Establish a new udp server. This is now required for using udp.send.

	ClearSubdevices();
	fetchDeviceInfoFromTableAndConfigure();

	wiz = new WizProtocol(controller.ip);
	// This is what happens in my wireshark
	wiz.setDeviceState(true);
	wiz.setDeviceState(true);
}

export function Render(){
	const RGBData = subdevices.length > 0 ? GetRGBFromSubdevices() : GetDeviceRGB();

	wiz.SendRGB(RGBData);
	device.pause(10);
}

export function Shutdown(suspend){
	if(TurnOffOnShutdown){
		wiz.setDeviceState(false);
	}
}

export function onvariableLedCountChanged(){
	SetLedCount(variableLedCount);
}

function GetRGBFromSubdevices(){
	const RGBData = [];

	for(const subdevice of subdevices){
		const ledPositions = subdevice.ledPositions;

		for(let i = 0 ; i < ledPositions.length; i++){
			const ledPosition = ledPositions[i];
			let color;

			if (LightingMode === "Forced") {
				color = hexToRgb(forcedColor);
			} else {
				color = device.subdeviceColor(subdevice.id, ledPosition[0], ledPosition[1]);
			}

			RGBData[i * 3] = color[0];
			RGBData[i * 3 + 1] = color[1];
			RGBData[i * 3 + 2] = color[2];
		}
	}

	return RGBData;
}

function GetDeviceRGB(){
	const RGBData = new Array(ledCount * 3);

	for(let i = 0 ; i < ledPositions.length; i++){
		const ledPosition = ledPositions[i];
		let color;

		if (LightingMode === "Forced") {
			color = hexToRgb(forcedColor);
		} else {
			color = device.color(ledPosition[0], ledPosition[1]);
		}

		RGBData[i * 3] = color[0];
		RGBData[i * 3 + 1] = color[1];
		RGBData[i * 3 + 2] = color[2];
	}

	return RGBData;
}

function fetchDeviceInfoFromTableAndConfigure() {
	if(WizDeviceLibrary.hasOwnProperty(controller.sku)){
		const WizDeviceInfo = WizDeviceLibrary[controller.sku];
		device.setName(`Wiz ${WizDeviceInfo.name}`);

		if(WizDeviceInfo.hasVariableLedCount){
			device.addProperty({"property": "variableLedCount", label: "Segment Count", "type": "number", "min": 1, "max": 60, default: WizDeviceInfo.ledCount, step: 1});
			SetLedCount(variableLedCount);
		}else{
			SetLedCount(WizDeviceInfo.ledCount);
			device.removeProperty("variableLedCount");
		}

		device.SetIsSubdeviceController(false);
		device.SetIsSubdeviceController(false);

	}else{
		device.log("Using Default Layout...");
		device.setName(`Wiz: ${controller.sku}`);
		SetLedCount(20);
	}
}

function SetLedCount(count){
	ledCount = count;

	CreateLedMap();
	device.setSize([ledCount, 1]);
	device.setControllableLeds(ledNames, ledPositions);
}

function CreateLedMap(){
	ledNames = [];
	ledPositions = [];

	for(let i = 0; i < ledCount; i++){
		ledNames.push(`Led ${i + 1}`);
		ledPositions.push([i, 0]);
	}
}

function hexToRgb(hex) {
	const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
	const colors = [];
	colors[0] = parseInt(result[1], 16);
	colors[1] = parseInt(result[2], 16);
	colors[2] = parseInt(result[3], 16);

	return colors;
}

let UDPServer;

export function DiscoveryService() {
	this.IconUrl = "https://www.wizconnected.com/content/dam/wiz/master/logo-wiz-black-navigation.svg";
	this.firstRun = true;

	this.Initialize = function(){
		service.log("Searching for Wiz network devices...");
		this.LoadCachedDevices();
	};

	this.UdpBroadcastPort = 38899;
	this.UdpListenPort = 38899;
	this.UdpBroadcastAddress = "255.255.255.255";

	this.lastPollTime = 0;
	this.PollInterval = 60000;

	this.cache = new IPCache();
	this.activeSockets = new Map();
	this.activeSocketTimer = Date.now();

	this.LoadCachedDevices = function(){
		service.log("Loading Cached Devices...");

		for(const [key, value] of this.cache.Entries()){
			service.log(`Found Cached Device: [${key}: ${JSON.stringify(value)}]`);
			this.checkCachedDevice(value.ip);
		}
	};

	this.checkCachedDevice = function(ipAddress) {
		service.log(`Checking IP: ${ipAddress}`);

		if(UDPServer !== undefined) {
			UDPServer.stop();
			UDPServer = undefined;
		}

		const socketServer = new UdpSocketServer({
			ip : ipAddress,
			isDiscoveryServer : true
		});

		this.activeSockets.set(ipAddress, socketServer);
		this.activeSocketTimer = Date.now();
		socketServer.start();
	};

	this.clearSockets = function() {
		if(Date.now() - this.activeSocketTimer > 10000 && this.activeSockets.size > 0) {
			service.log("Nuking Active Cache Sockets.");

			for(const [key, value] of this.activeSockets.entries()){
				service.log(`Nuking Socket for IP: [${key}]`);
				value.stop();
				this.activeSockets.delete(key);
				//Clear would be more efficient here, however it doesn't kill the socket instantly.
				//We instead would be at the mercy of the GC.
			}
		}
	};

	this.forceDiscovery = function(value) {
		const packetType = JSON.parse(value.response).msg.cmd;
		service.log(`Type: ${packetType}`);

		if(packetType === "scan"){
			service.log(`New host discovered!`);
			service.log(value);
			this.CreateControllerDevice(value);
		}
	};

	this.purgeIPCache = function() {
		this.cache.PurgeCache();
	};

	this.CheckForDevices = function(){
		if(Date.now() - discovery.lastPollTime < discovery.PollInterval){
			return;
		}

		discovery.lastPollTime = Date.now();
		service.log("Broadcasting device scan...");
		service.broadcast(JSON.stringify({
			msg: {
				cmd: "scan",
				data: {
					account_topic: "reserve",
				},
			}
		}));
	};

	this.Update = function(){
		for(const cont of service.controllers){
			cont.obj.update();
		}

		this.clearSockets();
		this.CheckForDevices();
	};

	this.Shutdown = function(){

	};

	this.Discovered = function(value) {

		const packetType = JSON.parse(value.response).msg.cmd;
		service.log(`Type: ${packetType}`);

		if(packetType === "scan"){
			service.log(`New host discovered!`);
			service.log(value);
			this.CreateControllerDevice(value);
		}
	};

	this.Removal = function(value){

	};

	this.CreateControllerDevice = function(value){
		const controller = service.getController(value.id);

		if (controller === undefined) {
			service.addController(new WizController(value));
		} else {
			controller.updateWithValue(value);
		}
	};
}

class WizController{
	 constructor(value){
		this.id = value?.id ?? "Unknown ID";

		const packet = JSON.parse(value.response).msg;
		const response = packet.data;
		const type = packet.cmd;
		service.log(`Type: ${type}`);

		service.log(response);

		this.ip = response?.ip ?? "Unknown IP";
		this.name = response?.sku ?? "Unknown SKU";


		this.WizInfo = this.GetWizDevice(response.sku);
		this.deviceImage = this.WizInfo?.deviceImage;

		this.device = response.device;
		this.sku = response?.sku ?? "Unknown Wiz SKU";
		this.bleVersionHard = response?.bleVersionHard ?? "Unknown";
		this.bleVersionSoft = response?.bleVersionSoft ?? "Unknown";
		this.wifiVersionHard = response?.wifiVersionHard ?? "Unknown";
		this.wifiVersionSoft = response?.wifiVersionSoft ?? "Unknown";
		this.initialized = false;

		this.DumpControllerInfo();

		if(this.name !== "Unknown") {
			this.cacheControllerInfo(this);
		}
	}

	GetWizDevice(sku){
		if(WizDeviceLibrary.hasOwnProperty(sku)){
		  return WizDeviceLibrary[sku];
		}

		return {
			name: "Unknown",
			supportDreamView: false,
			supportRazer: false,
			deviceImage: "https://www.wizconnected.com/content/dam/wiz/master/logo-wiz-black-navigation.svg"
		};
	}

	DumpControllerInfo(){
		service.log(`id: ${this.id}`);
		service.log(`ip: ${this.ip}`);
		service.log(`device: ${this.device}`);
		service.log(`sku: ${this.sku}`);
		service.log(`bleVersionHard: ${this.bleVersionHard}`);
		service.log(`bleVersionSoft: ${this.bleVersionSoft}`);
		service.log(`wifiVersionHard: ${this.wifiVersionHard}`);
		service.log(`wifiVersionSoft: ${this.wifiVersionSoft}`);
	}

	updateWithValue(value){
		this.id = value.id;

		const response = JSON.parse(value.response).msg.data;

		this.ip = response?.ip ?? "Unknown IP";
		this.device = response.device;
		this.sku = response?.sku ?? "Unknown Wiz SKU";
		this.bleVersionHard = response?.bleVersionHard ?? "Unknown";
		this.bleVersionSoft = response?.bleVersionSoft ?? "Unknown";
		this.wifiVersionHard = response?.wifiVersionHard ?? "Unknown";
		this.wifiVersionSoft = response?.wifiVersionSoft ?? "Unknown";

		service.updateController(this);
	}

	update(){
		if(!this.initialized){
			this.initialized = true;
			service.updateController(this);
			service.announceController(this);
		}
	}

	cacheControllerInfo(value){
		discovery.cache.Add(value.id, {
			name: value.name,
			ip: value.ip,
			id: value.id
		});
	}
}


class WizProtocol {

	constructor(ip, supportDreamView, supportRazer){
		this.ip = ip;
		this.port = 4003;
		this.lastPacket = 0;
	}

	setDeviceState(on){
		UDPServer.send(JSON.stringify({
			"msg": {
				"cmd": "turn",
				"data": {
					"value": on ? 1 : 0
				}
			}
		}));
	}

	SetBrightness(value) {
		UDPServer.send(JSON.stringify({
			"msg": {
				"cmd":"brightness",
				"data": {
					"value":value
				}
			}
		}));
	}

	calculateXorChecksum(packet) {
		let checksum = 0;

		for (let i = 0; i < packet.length; i++) {
		  checksum ^= packet[i];
		}

		return checksum;
	}

	SetStaticColor(RGBData){
		UDPServer.send(JSON.stringify({
			msg: {
				cmd: "colorwc",
				data: {
					color: {r: RGBData[0], g: RGBData[1], b: RGBData[2]},
					colorTemInKelvin: 0
				}
			}
		}));
		device.pause(100);
	}

	SendEncodedPacket(packet){
		const command = base64.Encode(packet);

		const now = Date.now();

		if (now - this.lastPacket > 1000) {
			UDPServer.send(JSON.stringify({
				msg: {
					cmd: "status",
					data: {}
				}
			}));
			this.lastPacket = now;
		}

		UDPServer.send(JSON.stringify({
			msg: {
				cmd: "razer",
				data: {
					pt: command,
				},
			},
		}));
	}

	SendRGB(RGBData) {
		this.SetStaticColor(RGBData.slice(0, 3));
	}
}

class UdpSocketServer{
	constructor (args) {
		this.count = 0;
		/** @type {udpSocket | null} */
		this.server = null;
		this.listenPort = args?.listenPort ?? 0;
		this.broadcastPort = args?.broadcastPort ?? 4001;
		this.ipToConnectTo = args?.ip ?? "239.255.255.250";
		this.isDiscoveryServer = args?.isDiscoveryServer ?? false;
	}

	write(packet, address, port) {
		if(!this.server) {
			this.server = udp.createSocket();
		}

		this.server.write(packet, address, port);
	}

	send(packet) {
		if(!this.server) {
			this.server = udp.createSocket();
			device.log("Defining new UDP Socket so we can send data.");
		}

		this.server.send(packet);
	}

	start(){
		this.server = udp.createSocket();

		if(this.server){

			// Given we're passing class methods to the server, we need to bind the context (this instance) to the function pointer
			this.server.on('error', this.onError.bind(this));
			this.server.on('message', this.onMessage.bind(this));
			this.server.on('listening', this.onListening.bind(this));
			this.server.on('connection', this.onConnection.bind(this));
			this.server.bind(this.listenPort);
			this.server.connect(this.ipToConnectTo, this.broadcastPort);

		}
	};

	stop(){
		if(this.server) {
			this.server.disconnect();
			this.server.close();
		}
	}

	onConnection(){
		service.log('Connected to remote socket!');
		service.log("Remote Address:");
		service.log(this.server.remoteAddress(), {pretty: true});
		service.log("Sending Check to socket");

		const bytesWritten = this.server.send(JSON.stringify({
			msg: {
				cmd: "scan",
				data: {
					account_topic: "reserve",
				},
			}
		}));

		if(bytesWritten === -1){
			service.log('Error sending data to remote socket');
		}
	};

	onListenerResponse(msg) {
		service.log('Data received from client');
		service.log(msg, {pretty: true});
	}

	onListening(){
		const address = this.server.address();
		service.log(`Server is listening at port ${address.port}`);

		// Check if the socket is bound (no error means it's bound but we'll check anyway)
		service.log(`Socket Bound: ${this.server.state === this.server.BoundState}`);
	};
	onMessage(msg){
		service.log('Data received from client');
		service.log(msg, {pretty: true});

		if(this.isDiscoveryServer) {
			discovery.forceDiscovery(msg);
		}
	};
	onError(code, message){
		service.log(`Error: ${code} - ${message}`);
		//this.server.close(); // We're done here
	};
}

class IPCache{
	constructor(){
		this.cacheMap = new Map();
		this.persistanceId = "ipCache";
		this.persistanceKey = "cache";

		this.PopulateCacheFromStorage();
	}
	Add(key, value){
		if(!this.cacheMap.has(key)) {
			service.log(`Adding ${key} to IP Cache...`);

			this.cacheMap.set(key, value);
			this.Persist();
		}
	}

	Remove(key){
		this.cacheMap.delete(key);
		this.Persist();
	}
	Has(key){
		return this.cacheMap.has(key);
	}
	Get(key){
		return this.cacheMap.get(key);
	}
	Entries(){
		return this.cacheMap.entries();
	}

	PurgeCache() {
		service.removeSetting(this.persistanceId, this.persistanceKey);
		service.log("Purging IP Cache from storage!");
	}

	PopulateCacheFromStorage(){
		service.log("Populating IP Cache from storage...");

		const storage = service.getSetting(this.persistanceId, this.persistanceKey);

		if(storage === undefined){
			service.log(`IP Cache is empty...`);

			return;
		}

		let mapValues;

		try{
			mapValues = JSON.parse(storage);
		}catch(e){
			service.log(e);
		}

		if(mapValues === undefined){
			service.log("Failed to load cache from storage! Cache is invalid!");

			return;
		}

		if(mapValues.length === 0){
			service.log(`IP Cache is empty...`);
		}

		this.cacheMap = new Map(mapValues);
	}

	Persist(){
		service.log("Saving IP Cache...");
		service.saveSetting(this.persistanceId, this.persistanceKey, JSON.stringify(Array.from(this.cacheMap.entries())));
	}

	DumpCache(){
		for(const [key, value] of this.cacheMap.entries()){
			service.log([key, value]);
		}
	}
}

// eslint-disable-next-line max-len
/** @typedef { {name: string, deviceImage: string, sku: string, state: number, supportRazer: boolean, supportDreamView: boolean, ledCount: number, hasVariableLedCount?: boolean } } WizDevice */
/** @type {Object.<string, WizDevice>} */
const WizDeviceLibrary = {
	GU10: {
		name: "Wiz GU10 50W PAR16",
		deviceImage: "https://www.assets.signify.com/is/image/Signify/WiFi_BLE_4_9GU10_Color_922_65_6_1PF-SPP?wid=960&hei=720&qlt=82",
		sku: "GU10",
		state: 1,
		ledCount: 1
	},
};