/* This is a VPN Look-Out Applet.
It is not only useful in its own right
but is also provides a 'tutorial' framework for other more
complex applets - for example it provides a settings screen
and a 'standard' right click (context) menu which opens
the settings panel and a submenu.
Items with a ++ in the comment are useful for re-use
*/
const Applet = imports.ui.applet; // ++
const Settings = imports.ui.settings; // ++ Needed if you use Settings Screen
const St = imports.gi.St; // ++
const PopupMenu = imports.ui.popupMenu; // ++ Needed for menus
const Lang = imports.lang; //  ++ Needed for menus
const GLib = imports.gi.GLib; // ++ Needed for starting programs and translations
const Gio = imports.gi.Gio; // Needed for file infos
const Mainloop = imports.mainloop; // Needed for timer update loop
//const ModalDialog = imports.ui.modalDialog; // Needed for Modal Dialog used in Alert
const Gettext = imports.gettext; // ++ Needed for translations
const Main = imports.ui.main; // ++ Needed for notify()
const MessageTray = imports.ui.messageTray; // ++ Needed for the criticalNotify() function in this script
const Util = imports.misc.util; // Needed for spawnCommandLine()

// ++ Always needed if you want localisation/translation support
// New l10n support thanks to ideas from @Odyseus, @lestcape and @NikoKrause

var UUID;
function _(str) {
	let customTrans = Gettext.dgettext(UUID, str);
	if (customTrans !== str && customTrans !== "")
		return customTrans;
	return Gettext.gettext(str);
}

/**
 * criticalNotify:
 * (Code from imports.ui.main ; modified to return notification, to allow to destroy it.)
 * @msg: A critical message
 * @details: Additional information
 */
var messageTray = new MessageTray.MessageTray();
function criticalNotify(msg, details, icon) {
	let source = new MessageTray.SystemNotificationSource();
	messageTray.add(source);
	let notification = new MessageTray.Notification(source, msg, details, { icon: icon });
	notification.setTransient(false);
	notification.setUrgency(MessageTray.Urgency.CRITICAL);
	source.notify(notification);
	return notification
}


/*
Function to provide a Modal Dialog. This approach is thanks to Mark Bolin
It works, even if I do not fully understand it, and has done for years in NUMA!
*/
/*
function AlertDialog(value) {
	this._init(value);
};

AlertDialog.prototype = {
	__proto__: ModalDialog.ModalDialog.prototype,
	_init: function (value) {
		ModalDialog.ModalDialog.prototype._init.call(this);
		let label = new St.Label({
			text: value ,
			style_class: "centered"
		});
		this.contentLayout.add(label);
		this.setButtons([{
			style_class: "centered",
			label: _("Ok"),
			action: Lang.bind(this, function () {
				this.close();
			})
		}]);
	}
};
*/

// ++ Always needed
function MyApplet(metadata, orientation, panelHeight, instance_id) {
	this._init(metadata, orientation, panelHeight, instance_id);
}

// ++ Always needed
MyApplet.prototype = {
	__proto__: Applet.TextIconApplet.prototype, // Now TextIcon Applet

	_init: function (metadata, orientation, panelHeight, instance_id) {
		Applet.TextIconApplet.prototype._init.call(this, orientation, panelHeight, instance_id);
		//try {
			this.settings = new Settings.AppletSettings(this, metadata.uuid, instance_id); // ++ Picks up UUID from metadata for Settings

			if (this.versionCompare( GLib.getenv('CINNAMON_VERSION') ,"3.2" ) >= 0 ){
				 this.setAllowedLayout(Applet.AllowedLayout.BOTH);
			}

			this.settings.bindProperty(Settings.BindingDirection.IN, // Setting type
				"refreshInterval-spinner", // The setting key
				"refreshInterval", // The property to manage (this.refreshInterval)
				this.on_settings_changed, // Callback when value changes
				null); // Optional callback data

			this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL,
				"vpnInterface",
				"vpnInterface",
				this.on_settings_changed,
				null);
			this.settings.bindProperty(Settings.BindingDirection.IN,
				"vpnName",
				"vpnName",
				this.on_settings_changed,
				null);

			this.settings.bindProperty(Settings.BindingDirection.IN,
				"displayType",
				"displayType",
				this.on_settings_changed,
				null);

			this.settings.bindProperty(Settings.BindingDirection.IN,
				"useSoundAlert",
				"useSoundAlert",
				this.on_settings_changed,
				null);

			this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL,
				"connectAtStartup",
				"connectAtStartup",
				this.on_settings_changed,
				null);

			this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL,
				"reconnect",
				"reconnect",
				this.on_settings_changed,
				null);

			this.settings.bindProperty(Settings.BindingDirection.IN,
				"useSoundAlertAtBeginning",
				"useSoundAlertAtBeginning",
				this.on_settings_changed,
				null);

			this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL,
				"stopTransmission",
				"stopTransmission",
				this.on_settings_changed,
				null);

			this.settings.bindProperty(Settings.BindingDirection.BIDIRECTIONAL,
				"restartTransmission",
				"restartTransmission",
				this.on_settings_changed,
				null);

			this.instance_id = instance_id;
			// ++ Make metadata values available within applet for context menu.
			this.appletName = metadata.name;
			this.appletPath = metadata.path;
			//this.cssfile = metadata.path + "/stylesheet.css"; // No longer required
			this.changelog = metadata.path + "/CHANGELOG.md";
			this.helpfile = metadata.path + "/README.md";
			this.vpnscript = metadata.path + "/scripts/vpn_status.sh";
			this.vpnifacedetect = metadata.path + "/scripts/vpn_iface_detect.sh";

			this.set_icons();
			
			this.stoptransmissionscript = metadata.path + "/scripts/stop_transmission.sh";
			this.starttransmissionscript = metadata.path + "/scripts/start_transmission.sh";
			this.transmissionstoppedbyapplet = false ;

			this.homedir = GLib.get_home_dir() ;
			this.localePath = this.homedir + '/.local/share/locale';

			// Set initial value
			this.set_applet_icon_path(this.vpnwait);

			// Make sure the temp files are created
			GLib.spawn_command_line_async('touch /tmp/.vpn_status /tmp/.vpn_name');

			// No interface in settings ?
			if (this.vpnInterface=="") {
				this.vpn_interface_detect();
			}

			// Install Languages (from .po files)
			this.execInstallLanguage();

			// ++ Part of new l10n support
			UUID = metadata.uuid;
			this.uuid = metadata.uuid;
			Gettext.bindtextdomain(metadata.uuid, GLib.get_home_dir() + "/.local/share/locale");

			this.flashFlag = true; // flag for flashing background
			this.flashFlag2 = true; // flag for second flashing background
			this.vpnStatus = "waiting"; // Initialise lastBatteryPercentage
			this.vpnStatusOld = "invalid";
			this.alertFlag = !this.useSoundAlertAtBeginning; // Flag says alert has been tripped to avoid repeat notifications


			this.on_orientation_changed(orientation); // Initialise for panel orientation

			this.applet_running = true; //** New to allow applet to be fully stopped when removed from panel

			// Choose Text Editor depending on whether Mint 18 with Cinnamon 3.0 and latter
			if (this.versionCompare(GLib.getenv('CINNAMON_VERSION'), "3.0") <= 0) {
				this.textEd = "gedit";
			} else {
				this.textEd = "xed";
			}

			// Check that all Dependencies Met by presence of sox and zenity

			if (this.are_dependencies_installed()) {
				 this.dependenciesMet = true;
			} else {
				 let icon = new St.Icon({ icon_name: 'error',
				 icon_type: St.IconType.FULLCOLOR,
				 icon_size: 36 });
				 let criticalMessage = _("You appear to be missing some of the programs required for this applet to have all its features including notifications and audible alerts.")+"\n\n"+_("Please execute, in the just opened terminal, the commands:")+"\napt update\napt install zenity sox libsox-fmt-mp3\n\n";
				 this.notification = criticalNotify(_("Some dependencies are not installed!"), criticalMessage, icon);
				 // Translators: The next message should not be translated.
				 GLib.spawn_command_line_async("gnome-terminal -e 'sh -c \"echo vpnLookOut Applet message: Some packages needed!\\\\\\\\nTo complete the installation, please enter and execute the command: \\\\\\\\napt update \\\\&\\\\& apt install zenity sox libsox-fmt-mp3; sleep 1; exec bash\"'");
				 this.dependenciesMet = false;
			}

			// ++ Set up left click menu
			this.menuManager = new PopupMenu.PopupMenuManager(this);
			this.menu = new Applet.AppletPopupMenu(this, orientation);
			this.menuManager.addMenu(this.menu);

			// ++ Build Context (Right Click) Menu
			this.buildContextMenu();
			// ++ Build (Left Click) Menu
			this.makeMenu()


			// Finally setup to start the update loop for the applet display running
			if (this.displayType == "compact") {
				this.set_applet_label("");
			} else {
				this.set_applet_label("VPN");
			}

			if (this.dependenciesMet) {
				this.set_applet_tooltip(_("Waiting"));
			} else {
				this.set_applet_tooltip("apt install zenity sox libsox-fmt-mp3");
			}

			// If required, connect on last VPN
			if (this.connectAtStartup && this.vpnName != "" && this.vpnInterface != "") {
				// Get VPN Status via asyncronous script
				GLib.spawn_command_line_sync('sh ' + this.vpnscript + ' ' + this.vpnInterface);
				// Get the VPN Status ('on', 'off' or 'waiting')
				this.vpnStatus = GLib.file_get_contents("/tmp/.vpn_status").toString();
				if ( this.vpnStatus.trim().length > 6 ) { // this.vpnStatus string starts by 'true,'
					 this.vpnStatus = this.vpnStatus.trim().substr(5); // removing 'true,'
					 this.vpnStatusOld = this.vpnStatus;
				} else {
					 this.vpnStatus =  this.vpnStatusOld;
				}
				if (this.vpnStatus != "on") {
					GLib.spawn_command_line_async('bash -c \'/usr/bin/nmcli connection up "' + this.vpnName + '" > /dev/null \'')
				}
			}

			this.on_settings_changed()   // This starts the MainLoop timer loop
		//} catch (e) {
		//	global.logError(e);
		//}
	}, // End of _init

	are_dependencies_installed: function() {
		let soxmp3WitnessPath = "/usr/share/doc/libsox-fmt-mp3/copyright";
		let soxmp3WitnessFile = Gio.file_new_for_path(soxmp3WitnessPath);
		let soxmp3Installed = soxmp3WitnessFile.query_exists(null);
		return (soxmp3Installed && GLib.find_program_in_path("sox") && GLib.find_program_in_path("zenity"))
	}, // End of are_dependencies_installed

	execInstallLanguage: function() {
		//let poPath = "~/.local/share/cinnamon/applets/vpnLookOut@claudiux/po";
		//let poDir = Gio.file_new_for_path(poPath);
		//let poList = poDir.enumerate_children('standard::name,standard::type', Gio.FileQueryInfoFlags.NONE, null);
		//GLib.spawn_command_line_async('sh -c echo "'+ poList + '" >> /tmp/poList.txt');

		let generatemoPath = this.appletPath + '/scripts/generate_mo.sh'; // script to generate .mo files
		let moFrPath = this.localePath + '/fr/LC_MESSAGES/vpnLookOut@claudiux.mo'
		let moFile = Gio.file_new_for_path(moFrPath);

		let potFrPath = this.appletPath + '/po/vpnLookOut@claudiux.pot';
		let potFile = Gio.file_new_for_path(potFrPath);

		if (potFile.query_exists(null)) { // .pot file exists
			if (!moFile.query_exists(null)) { // .mo file doesn't exist
				GLib.spawn_command_line_async('bash -c "' + generatemoPath + '"'); // generate all .mo files
			} else { // .mo file exists
				let potModified = potFile.query_info('time::modified', Gio.FileQueryInfoFlags.NONE, null).get_modification_time().tv_sec;
				let moModified = moFile.query_info('time::modified', Gio.FileQueryInfoFlags.NONE, null).get_modification_time().tv_sec;
				if (potModified > moModified) { // .pot file is most recent than .mo file
					GLib.spawn_command_line_async('bash -c "' + generatemoPath + '"'); // generate all .mo files
				}
			}
		}
	}, // End of execInstallLanguage

	get_system_icon_theme: function() {
		let _SETTINGS_SCHEMA='org.cinnamon.desktop.interface';
		let _SETTINGS_KEY = 'icon-theme';
		let _interface_settings = new Gio.Settings({ schema_id: _SETTINGS_SCHEMA });
		let _icon_theme = _interface_settings.get_string(_SETTINGS_KEY);
		return _icon_theme
	}, // End of get_system_icon_theme

	set_icons: function() {
		this.system_icon_theme = this.get_system_icon_theme();
		if (this.system_icon_theme.startsWith('Mint-X'))
			this.system_icon_theme = 'Mint-X';
		if (this.old_system_icon_theme == null || this.system_icon_theme != this.old_system_icon_theme) {
			this.old_system_icon_theme = this.system_icon_theme;
			this.icon_theme_path = this.appletPath + '/icons/byTheme/' + this.system_icon_theme;
			let icon_theme_dir = Gio.file_new_for_path(this.icon_theme_path);
			let icon_theme_exists = icon_theme_dir.query_exists(null);
			if (!icon_theme_exists) {
				this.icon_theme_path = this.appletPath + '/icons/default';
			}
			this.vpnon = this.icon_theme_path + "/vpn-on.png";
			this.vpnoff = this.icon_theme_path + "/vpn-off.png";
			this.vpnwait = this.icon_theme_path + "/vpn-wait.png";
		}
	}, // End of set_icons

	vpn_interface_detect: function() {
		// Try to detect the VPN interface.
		let [res, out, err, status] = GLib.spawn_command_line_sync('sh ' + this.vpnifacedetect);
		// res is a boolean : true if command line has been correctly executed
		// out is the return of the script (as that is sent by 'echo' command in a bash script)
		// err is the error message, if an error occured
		// status is the status code (as that is sent by an 'exit' command in a bash script)
		if (res && status == 0) {
			this.vpnInterface=out.toString(); // This is our BIDIRECTIONAL setting - by updating our configuration file will also be updated
		}
	}, // End of vpn_interface_detect

	get_vpn_names: function() {
		let [res, out, err, status] = GLib.spawn_command_line_sync('sh -c ' + this.appletPath + "/scripts/vpn_names.sh");
		let list_vpn_names=[];
		if (res && status == 0) {
			list_vpn_names=out.toString().split(';');
		} else {
			if (this.vpnName != "") {
				list_vpn_names.push(this.vpnName);
			}
		}
		return list_vpn_names
	}, // End of get_vpn_names

	on_orientation_changed: function (orientation) {
		this.orientation = orientation;
		if (this.versionCompare( GLib.getenv('CINNAMON_VERSION') ,"3.2" ) >= 0 ){
			 if (this.orientation == St.Side.LEFT || this.orientation == St.Side.RIGHT) {
				 // vertical
				 this.isHorizontal = false;
			 } else {
				 // horizontal
				 this.isHorizontal = true;
			 }
		 } else {
				this.isHorizontal = true;  // Do not check unless >= 3.2
		 }
	}, // End of on_orientation_changed


	// Compare two version numbers (strings) based on code by Alexey Bass (albass)
	// Takes account of many variations of version numers including cinnamon.
	versionCompare: function(left, right) {
		if (typeof left + typeof right != 'stringstring')
			return false;
		var a = left.split('.'),
			b = right.split('.'),
			i = 0,
			len = Math.max(a.length, b.length);
		for (; i < len; i++) {
			if ((a[i] && !b[i] && parseInt(a[i]) > 0) || (parseInt(a[i]) > parseInt(b[i]))) {
				return 1;
			} else if ((b[i] && !a[i] && parseInt(b[i]) > 0) || (parseInt(a[i]) < parseInt(b[i]))) {
				return -1;
			}
		}
		return 0;
	}, // End of versionCompare

	// ++ Function called when settings are changed
	on_settings_changed: function() {
		//this.slider_demo.setValue((this.alertPercentage - 10) / 30);
		if (this.displayType == "compact") {
			this.set_applet_label("");
		} else {
			this.set_applet_label("VPN");
		}

		this.updateLoop();
	}, // End of on_settings_changed

	// ++ Null function called when Generic (internal) Setting changed
	on_generic_changed: function() {},

	on_checkbox_connectAtStartup_changed: function() {
		this.connectAtStartup = !this.connectAtStartup; // This is our BIDIRECTIONAL setting - by updating our configuration file will also be updated
		this.checkbox_connectAtStartup.setToggleState(this.connectAtStartup);
		this.checkbox_connectAtStartup2.setToggleState(this.connectAtStartup)
	}, // End of on_checkbox_connectAtStartup_changed

	on_checkbox_reconnect_changed: function() {
		this.reconnect = !this.reconnect ; // This is our BIDIRECTIONAL setting - by updating our configuration file will also be updated
		if (this.reconnect) {
			// The Connect button is then useless.
			this.button_connect.actor.hide();
			this.button_connect2.actor.hide();
		} else {
			// The Connect button is then useful.
			this.button_connect.actor.show();
			this.button_connect2.actor.show()
		}
		// Update checboxes
		this.checkbox_reconnect.setToggleState(this.reconnect); // in left-click menu
		this.checkbox_reconnect2.setToggleState(this.reconnect); // in right-click menu
	}, // End of on_checkbox_reconnect_changed

	on_checkbox_stopTransmission_changed: function() {
		this.stopTransmission = !this.stopTransmission ; // This is our BIDIRECTIONAL setting - by updating our configuration file will also be updated
		this.checkbox_stopTransmission.setToggleState(this.stopTransmission); // update Left Click Menu
		this.checkbox_stopTransmission2.setToggleState(this.stopTransmission);// update Right Click Context Menu
	}, // End of on_checkbox_stopTransmission_changed

	on_checkbox_restartTransmission_changed: function() {
		this.restartTransmission = !this.restartTransmission ; // This is our BIDIRECTIONAL setting - by updating our configuration file will also be updated
		this.checkbox_restartTransmission.setToggleState(this.restartTransmission); // update Left Click Menu
		this.checkbox_restartTransmission2.setToggleState(this.restartTransmission);// update Right Click Context Menu
	}, // End of on_checkbox_restartTransmission_changed

	on_button_connect: function() {
		this.vpnStatus == "waiting";
		this.vpnIcon = this.vpnwait ;
		this.set_applet_icon_path(this.vpnIcon) ;

		let l=this.SMCItems.length;
		for (let i=0; i<l; i++) {
			this.SMCItems[i].setSensitive(false)
		}

		if (this.vpnInterface != "" && this.vpnName != "") {
			if (this.vpnStatus != "on") {
				GLib.spawn_command_line_async('bash -c \'/usr/bin/nmcli connection up "' + this.vpnName + '" > /dev/null \'')
			} else {
				GLib.spawn_command_line_async('bash -c \'/usr/bin/nmcli connection down "' + this.vpnName + '" > /dev/null \'')
			}
		}

		for (let i=0; i<l; i++) {
			if (this.SMCItems[i].label.text != this.vpnName) {
				this.SMCItems[i].setSensitive(true)
			}
		}

	}, // End of on_button_connect

	change_connection: function(new_co) {
		this.vpnStatus == "waiting";
		this.vpnIcon = this.vpnwait ;
		this.set_applet_icon_path(this.vpnIcon) ;

		let l=this.SMCItems.length;
		for (let i=0; i<l; i++) {
			this.SMCItems[i].setSensitive(false)
		}

		if (this.vpnStatus == "on") {
			let [res, out, err, status] = GLib.spawn_command_line_sync('bash -c \'/usr/bin/nmcli connection down "' + this.vpnName + '" > /dev/null \'')
		}

		GLib.spawn_command_line_async('bash -c \'/usr/bin/nmcli connection up "' + new_co + '" > /dev/null \'');

		for (let i=0; i<l; i++) {
			if (this.SMCItems[i].label.text == new_co) {
				this.SMCItems[i].setShowDot(true);
				//this.SMCItems[i].setSensitive(false)
			} else {
				this.SMCItems[i].setShowDot(false);
				this.SMCItems[i].setSensitive(true)
			}
		}
		this.vpnName = new_co;
	}, // End of change_connection


	// ++ Build the Right Click Context Menu
	buildContextMenu: function() {
		//try {
			this._applet_context_menu.removeAll();
			// Header
			this.contextmenuitemHead1 = new PopupMenu.PopupMenuItem(_("VPN Look-Out Applet"), {
				reactive: false
			});
			this._applet_context_menu.addMenuItem(this.contextmenuitemHead1);

			// Info: Connection Status
			this.contextmenuitemInfo2 = new PopupMenu.PopupMenuItem("     " + _("Waiting for VPN interface information"), {
				reactive: false
			});
			this._applet_context_menu.addMenuItem(this.contextmenuitemInfo2);

			this._applet_context_menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

			if (this.dependenciesMet) {
				// checkbox Connect at start-up
				this.checkbox_connectAtStartup2 = new PopupMenu.PopupSwitchMenuItem(_("Connect to VPN as this applet starts."), this.connectAtStartup);
				this.checkbox_connectAtStartup2.connect("toggled", Lang.bind(this, this.on_checkbox_connectAtStartup_changed));
				this._applet_context_menu.addMenuItem(this.checkbox_connectAtStartup2);

				// checkbox Try to reconnect
				this.checkbox_reconnect2 = new PopupMenu.PopupSwitchMenuItem(_("Try to reconnect to VPN when it shuts down incidentally."), this.reconnect);
				this.checkbox_reconnect2.connect("toggled", Lang.bind(this, this.on_checkbox_reconnect_changed));
				this._applet_context_menu.addMenuItem(this.checkbox_reconnect2);

				// checkboxes Transmission
				this.checkbox_stopTransmission2 = new PopupMenu.PopupSwitchMenuItem(_("Shut down properly Transmission as soon as VPN falls."), this.stopTransmission);
				this.checkbox_stopTransmission2.connect("toggled", Lang.bind(this, this.on_checkbox_stopTransmission_changed));
				this._applet_context_menu.addMenuItem(this.checkbox_stopTransmission2);

				this.checkbox_restartTransmission2 = new PopupMenu.PopupSwitchMenuItem(_("Try to restart Transmission as soon as VPN restarts."), this.restartTransmission);
				this.checkbox_restartTransmission2.connect("toggled", Lang.bind(this, this.on_checkbox_restartTransmission_changed));
				this._applet_context_menu.addMenuItem(this.checkbox_restartTransmission2);

				this._applet_context_menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

				// button connect/disconnect
				this.button_connect2 = new PopupMenu.PopupSwitchMenuItem(_("Connection ON/OFF"), false);
				this.button_connect2.connect("toggled", Lang.bind(this, this.on_button_connect));
				this._applet_context_menu.addMenuItem(this.button_connect2);
				// this button must appear only if auto-reconnect is inactive
				if (this.vpnInterface == "" || this.vpnName == "" || this.reconnect) {
					this.button_connect2.actor.hide()
				} else {
					this.button_connect2.actor.show()
				}

				this._applet_context_menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

				// Help
				this.help2 = new PopupMenu.PopupMenuItem(_("Help..."));
				this.help2.connect('activate', Lang.bind(this, function(event) {
					GLib.spawn_command_line_async(this.textEd + ' ' + this.helpfile);
				}));
				this._applet_context_menu.addMenuItem(this.help2);

			}
		//} catch (e) {
		//	global.logError(e);
		//}
	}, // End of buildContextMenu

	//++ Build the Left Click Menu
	makeMenu: function() {
		//try {
			this.menu.removeAll();

			// Head
			this.menuitemHead1 = new PopupMenu.PopupMenuItem(_("VPN Look-Out Applet"), {
				reactive: false
			});
			this.menu.addMenuItem(this.menuitemHead1);

			// Status Info
			this.menuitemInfo2 = new PopupMenu.PopupMenuItem("     " + _("Waiting for VPN interface information"), {
				reactive: false
			});
			this.menu.addMenuItem(this.menuitemInfo2);

			this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

			// Access to System Network Settings
			this.menu.addSettingsAction(_("Network Settings"), 'network');
			//this.menu.addSettingsAction(_("Connection Info"),'connections-read');

			// Access to Network Manager: Connection editor
			this.menu.addAction(_("Network Connections"), Lang.bind(this, function() {
				Util.spawnCommandLine("nm-connection-editor");
			}));

			if (this.dependenciesMet) {
				// All dependencies are met, we can continue :
				this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

				// checkbox Connect at start-up
				this.checkbox_connectAtStartup = new PopupMenu.PopupSwitchMenuItem(_("Connect to VPN as this applet starts."), this.connectAtStartup);
				this.checkbox_connectAtStartup.connect("toggled", Lang.bind(this, this.on_checkbox_connectAtStartup_changed));
				this.menu.addMenuItem(this.checkbox_connectAtStartup);

				// checkbox reconnect
				this.checkbox_reconnect = new PopupMenu.PopupSwitchMenuItem(_("Try to reconnect to VPN when it shuts down incidentally."), this.reconnect);
				this.checkbox_reconnect.connect("toggled", Lang.bind(this, this.on_checkbox_reconnect_changed));
				this.menu.addMenuItem(this.checkbox_reconnect);

				// checkboxes about Transmission
				this.checkbox_stopTransmission = new PopupMenu.PopupSwitchMenuItem(_("Shut down properly Transmission as soon as VPN falls."), this.stopTransmission);
				this.checkbox_stopTransmission.connect("toggled", Lang.bind(this, this.on_checkbox_stopTransmission_changed));
				this.menu.addMenuItem(this.checkbox_stopTransmission);

				this.checkbox_restartTransmission = new PopupMenu.PopupSwitchMenuItem(_("Try to restart Transmission as soon as VPN restarts."), this.restartTransmission);
				this.checkbox_restartTransmission.connect("toggled", Lang.bind(this, this.on_checkbox_restartTransmission_changed));
				this.menu.addMenuItem(this.checkbox_restartTransmission);

				this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

				// button connect/disconnect
				this.button_connect = new PopupMenu.PopupSwitchMenuItem(_("Connection ON/OFF"), false);
				this.button_connect.connect("toggled", Lang.bind(this, this.on_button_connect));
				this.menu.addMenuItem(this.button_connect);
				// this button must appear only if auto-reconnect is inactive
				if (this.vpnInterface == "" || this.vpnName == "" || this.reconnect) {
					this.button_connect.actor.hide()
				} else {
					this.button_connect.actor.show()
				}
			}

			// ++ Set up sub menu for Connections Items
			this.subMenuConnections = new PopupMenu.PopupSubMenuMenuItem(_("Connections"));
			this.menu.addMenuItem(this.subMenuConnections);
			
			this.vpnNames = this.get_vpn_names();
			this.SMCItems = []; // Items of subMenuConnections (SMC)
			let l=this.vpnNames.length;
			for (let i=0; i<l ; i++) {
				let name=this.vpnNames[i];
				this.SMCItems[i] = new PopupMenu.PopupIndicatorMenuItem(name);
				this.SMCItems[i].connect('activate', Lang.bind(this, function(event) {
					this.change_connection(""+name)
				}));
				if (name==this.vpnName) {
					//this.SMCItems[i].setOrnament(PopupMenu.OrnamentType.CHECK, true);
					this.SMCItems[i].setShowDot(true);
					this.SMCItems[i].setSensitive(false)
				}
				this.subMenuConnections.menu.addMenuItem(this.SMCItems[i])
			};
			// Display this submenu only if there are more than one connection
			if (this.SMCItems.length < 2) {
				this.subMenuConnections.actor.hide()
			} else {
				this.subMenuConnections.actor.show()
			}
		//} catch (e) {
			//global.logError(e);
		//}
	}, // End of makeMenu

	//++ Handler for when the applet is clicked.
	on_applet_clicked: function(event) {
		this.updateLoop();
		this.menu.toggle();
	},

	// This updates the numerical display in the applet and in the tooltip
	updateUI: function() {

		//try {
			// Get the VPN Status ('on', 'off' or 'waiting')
			this.vpnStatus = GLib.file_get_contents("/tmp/.vpn_status").toString();
			if ( this.vpnStatus.trim().length > 6 ) { // this.vpnStatus string starts by 'true,'
				 this.vpnStatus = this.vpnStatus.trim().substr(5); // removing 'true,'
				 this.vpnStatusOld = this.vpnStatus;
			} else {
				 this.vpnStatus =  this.vpnStatusOld;
			}


			this.vpnMessage = " " ; // let with space character ; not empty.

			// Now select icon and message to display, also determine VPN Name and Transmission policy
			if (this.vpnStatus == "on") { // VPN is connected
				this.vpnIcon = this.vpnon ;
				if (this.vpnInterface != "" && this.vpnName != "") {
					this.button_connect.setStatus(_("Click to disconnect from VPN")+' '+this.vpnName);
					this.button_connect.setToggleState(true);
					this.button_connect2.setStatus(_("Click to disconnect from VPN")+' '+this.vpnName);
					this.button_connect2.setToggleState(true)

					if (this.reconnect) {
						this.button_connect.actor.hide()
					} else {
						this.button_connect.actor.show()
					}
				}
				this.alertFlag = false ;
				let vpnName = GLib.file_get_contents("/tmp/.vpn_name").toString().trim().substr(5).split(';')[0];
				if (vpnName != "") {
					this.vpnName = vpnName
				} ;

				let vpnMessage2 = "";
				if (this.vpnInterface != "") {
					vpnMessage2 = vpnMessage2 + " / "+ this.vpnInterface
				}

				this.vpnMessage = _("Connected") + ' (' + this.vpnName + vpnMessage2 + ')' ;
				if (this.restartTransmission && this.transmissionstoppedbyapplet) {
					command = 'sh ' + this.starttransmissionscript ;
					GLib.spawn_command_line_async(command)
				}
			} else if (this.vpnStatus == "off") { // VPN is disconnected
				this.vpnIcon = this.vpnoff ;
				this.vpnMessage = _("Disconnected") ;
				if (this.vpnInterface != "" && this.vpnName != "") {
					this.button_connect.setStatus(_("Click to connect to VPN")+' '+this.vpnName);
					this.button_connect.setToggleState(false);
					this.button_connect2.setStatus(_("Click to connect to VPN")+' '+this.vpnName);
					this.button_connect2.setToggleState(false)

					if (this.reconnect) {
						this.button_connect.actor.hide()
					} else {
						this.button_connect.actor.show()
					}
				}
				if ( !this.alertFlag ) {
					if ( this.useSoundAlert ) { // Sound alert
						GLib.spawn_command_line_async('play "/usr/share/sounds/freedesktop/stereo/phone-outgoing-busy.oga"') ;
					} ;
					if ( this.reconnect ) {
						command = 'nmcli connection up "' + this.vpnName +'" > /dev/null ';
						GLib.spawn_command_line_async(command)
					} ;
					if ( this.stopTransmission ) {
						command = 'sh ' + this.stoptransmissionscript ;
						this.transmissionstoppedbyapplet = GLib.spawn_command_line_async(command) ;
					} ;
					this.alertFlag = true
				}
			} else { // Waiting about VPN status
				this.vpnIcon = this.vpnwait ;
			}
			// set Tooltip
			this.set_applet_tooltip(_("VPN:") + " " + this.vpnMessage ) ;
			// set Icon
			this.set_applet_icon_path(this.vpnIcon) ;
			// set Menu Item Info
			this.menuitemInfo2.label.text = "    " + _("VPN:") + " " + this.vpnMessage ;
			this.contextmenuitemInfo2.label.text = "    " + _("VPN:") + " " + this.vpnMessage ;
			// Get VPN Status via asyncronous script ready for next cycle
			GLib.spawn_command_line_async('sh ' + this.vpnscript + ' ' + this.vpnInterface);

		//} catch (e) {
		//	global.logError(e);
		//}
	}, // End of updateUI

	// This is the loop run at refreshInterval rate to call updateUI() to update the display in the applet and tooltip
	updateLoop: function() {
		this.set_icons();
		if (!this.dependenciesMet && this.are_dependencies_installed()) {
			// At this time, the user just finished to install all dependencies.
			this.dependenciesMet=true;
			try {
			if (this.notification != null) {
				this.notification.destroy(2) // Destroys the precedent critical notification.
			}
			} catch(e) {
				global.log(e); // Not an error. Simply, the user has clicked on the notification, destroying it.
			}
			// Notification (temporary)
			let notifyMessage = _(this.appletName) + " " + _("is fully functional.");
			Main.notify(_("All dependencies are installed"), notifyMessage);
				 
			// Reload this applet with dependencies installed
			GLib.spawn_command_line_async('sh ' + this.appletPath + '/scripts/reload_ext.sh');
			// Stop the loop to avoid errors
			this.applet_running = false
		}

		// Inhibits also after the applet has been removed from the panel
		if (this.applet_running == true) {
			// No VPN interface in settings ?
			if (this.vpnInterface=="") {
				this.vpn_interface_detect() // Detect it !
			}

			this.updateUI(); // update icon and tooltip

			// One more loop !
			Mainloop.timeout_add_seconds(this.refreshInterval, Lang.bind(this, this.updateLoop));
		}
	}, // End of updateLoop

	// ++ This finalizes the settings when the applet is removed from the panel
	on_applet_removed_from_panel: function() {
		// inhibit the update timer when applet removed from panel
		this.applet_running = false;
		this.settings.finalize();
	}

};

function main(metadata, orientation, panelHeight, instance_id) {
	let myApplet = new MyApplet(metadata, orientation, panelHeight, instance_id);
	return myApplet;
}
/*
## Changelog

### 2.0.0
 * New features:
  * When installing this applet, it helps the user to install dependencies, if any.
  * Can connect to the last VPN used, as the applet starts (i.e at user login).
  * Left and right menus : Connection ON/OFF button appears only if reconnect button is unchecked.
  * Left menu: If there is more than one VPN connection, a submenu displays all these connections and allows you to connect to the selected one.
  * The 'Connect ON/OFF' button disappears when the option 'Try to reconnect to VPN when it shuts down incidentally' is checked.
  * Icons adapted to certain themes. (To be continued...)
 * Some code optimizations have been made.
 * Some bugs were fixed, especially:
  * If your VPN connection name included spaces, connect/disconnect was not possible in version 1.0.0. This bug was fixed.
 * Available languages  : English, French, Spanish, Italian.
 * Tested on Mint 18.1, 18.2, 18.3 with Cinnamon 3.2, 3.4.

### 1.0.0
 * Developed using code from BAMS, NUMA, Bumblebee and Timer Applets (Many thanks to the authors of these applets!)
 * Detects and displays correctly the status (connected/disconnected) of the VPN (the color of the icon changes).
 * Can emit a sound alert when the VPN disconnect.
 * Can try to reconnect to VPN when it has fallen.
 * Can stop/restart Transmission when VPN disconnects/reconnects.
 * A switch-button (into the menu) lets you manually connect/disconnect the VPN.
 * Internationalization: There is a .pot file (in the 'po' subdirectory) to use with poedit to translate messages. The .po files created are automatically converted in .mo files, which are put into the right directories. The translated messages will appear after the next Cinnamon startup.
 * Available languages  : English, French.
 * Works with Mint 18.2 and Cinnamon 3.2. It can be used on horizontal or vertical panel.
 * Fully functional.

*/
