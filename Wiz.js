import { Bulb } from "./node_modules/wikari/lib/bulb";
import { discover } from "./node_modules/wikari/lib/discover";

export function Name() { return "WizConnected"; }
export function VendorId() { return 0x0000; }
export function ProductId() { return 0x0000; }
export function Publisher() { return "samuelloranger@gmail.com"; }
export function Size() { return [30, 10]; }
export function DefaultPosition(){return [240, 120];}
export function DefaultScale(){return 8.0;}

export const WIZ_BULB_LISTEN_PORT = 38899;

let wiz;

/* global
shutdownColor:readonly
LightingMode:readonly
forcedColor:readonly
*/
export function ControllableParameters(){
	return [
		{"property":"shutdownColor", "label":"Shutdown Color", "min":"0", "max":"360", "type":"color", "default":"009bde"},
		{"property":"LightingMode", "label":"Lighting Mode", "type":"combobox", "values":["Canvas", "Forced"], "default":"Canvas"},
		{"property":"forcedColor", "label":"Forced Color", "min":"0", "max":"360", "type":"color", "default":"009bde"},
	];
}

let vLedNames = [
	"Led 1"
];

let vLedPositions = [
	[0, 0]
];

export function LedNames() {
	return vLedNames;
}

export function LedPositions() {
	return vLedPositions;
}

export function Initialize() {
	device.setName(controller.sku);
	device.setImageFromUrl(controller.deviceImage);

	wiz = new WizController(controller.ip, );
}

export function Render() {
	sendColors();
	device.pause(1);
}

export function Shutdown(SystemSuspending) {
    if(SystemSuspending){
        sendColors("#000000"); // Go Dark on System Sleep/Shutdown
    }else{
        sendColors(shutdownColor);
    }

	wiz.close()
}

function sendColors(overrideColor) {
	let color = null

	if(overrideColor){
		color = overrideColor;	
	}else if (LightingMode === "Forced") {
		color = forcedColor;
	}
	
	if (color && wiz) {
		wiz.setColor(overrideColor)
	}
}

export function Validate(endpoint) {
	return endpoint.interface === 0 && endpoint.usage === 0x0000 && endpoint.usage_page === 0x0000 && endpoint.collection === 0x0000;
}

export function ImageUrl() {
	return "https://www.wizconnected.com/content/dam/wiz/master/logo-wiz-black-navigation.svg";
}


export function DiscoveryService() {
	this.IconUrl = "https://www.wizconnected.com/content/dam/wiz/master/logo-wiz-black-navigation.svg";
	this.firstRun = true;

	this.Initialize = function(){
		service.log("Searching for Govee network devices...");
		this.LoadCachedDevices();
	};

	this.LoadCachedDevices = function(){
		service.log("Loading Cached Devices...");

		for(const [key, value] of this.cache.Entries()){
			service.log(`Found Cached Device: [${key}: ${JSON.stringify(value)}]`);
			service.addController(new WizController(value.ip, discovery))
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

	this.CreateControllerDevice = function(value){
		const controller = service.getController(value.id);

		if (controller === undefined) {
			service.addController(new WizController(value.ip, discovery));
		} else {
			controller.updateWithValue(value, );
		}
	};

}


class WizController {
	bulb = null;

	constructor(ip, discovery){
		this.ip = ip;

		this.bulb = new Bulb(
			ip,
			{
				port: WIZ_BULB_LISTEN_PORT
			}
		)

		bulb.onMessage((msg) => {
			discovery.forceDiscovery(msg);
		});
	}

	setBrightness(value) {
		this.bulb.brightness(value);
	}

	setColor(hexCode){
		this.bulb.color(hexCode);
	}

	close() {
		this.bulb.closeConnection();
	}
}