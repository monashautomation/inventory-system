/**
 * Bambu Lab HMS (Hardware Management System) error code lookup.
 * Codes normalized to 8-digit lowercase hex (no 0x prefix).
 * Source: BambuStudio resources/hms/hms_en_*.json
 * 1082 entries covering models: 093, 094, 20P, 22E, 239, 26A, 31B
 */
const HMS_ERROR_MAP: Record<string, string> = {
  "03004000": "Z axis homing failed; the task has been stopped.",
  "03004001":
    "The printer timed out waiting for the nozzle to cool down before homing.",
  "03004002": "Auto Bed Leveling failed; the task has been stopped.",
  "03004005": "The hotend cooling fan speed is abnormal.",
  "03004006": "The nozzle is clogged.",
  "03004008": "The AMS failed to change filament.",
  "03004009": "Homing XY axis failed.",
  "0300400a": "Mechanical resonance frequency identification failed.",
  "0300400b": "Internal communication exception",
  "0300400c": "The task was canceled.",
  "0300400d": "Resume failed after power loss.",
  "0300400e": "The motor self-check failed.",
  "0300400f": "The power supply voltage does not match the printer.",
  "03004010": "Nozzle offset calibration failed.",
  "03004011":
    "Flow Dynamics Calibration failed; please reinitiate printing or calibration.",
  "03004013": "Printing cannot be initiated while AMS is drying.",
  "03004014": "Homing Z axis failed: temperature control abnormality.",
  "03004015":
    'Nozzle clumping detection calibration failed. Please go to "Assistant" for troubleshooting.',
  "03004016":
    "Nozzle cleaning failed. Please click the Assistant for troubleshooting.",
  "0300401f":
    "The right hotend is not installed, and the toolhead cannot perform homing. Please install the hotend and then continue.",
  "03004020":
    "The nozzle presence detection failed. Please check the Assistant for details.",
  "03004021":
    "Nozzle offset calibration sensor signal abnormality detected. Please check the sensor and retry.",
  "03004030":
    "Z-axis homing failed. Remove the heated bed slider fixing screws and ensure no obstructions are blocking the heated bed's vertical movement. After resolving the issue, recalibrate on the device.",
  "03004031":
    "The nozzle has not been installed. Please install the nozzle and recalibrate.",
  "03004032":
    "XY homing failed. Please remove any foreign objects obstructing the toolhead movement and recalibrate.",
  "03004033":
    "Z-axis homing failed due to a temperature control abnormality. Please refer to the help instructions to resolve the issue, then recalibrate on the device.",
  "03004035":
    "Nozzle cleaning failed. Please refer to the help instructions to resolve the issue, then recalibrate on the device.",
  "03004036":
    "Nozzle offset calibration failed. Please refer to the help instructions to resolve the issue, then recalibrate on the device.",
  "03004037":
    "Nozzle clumping detection calibration failed. Please refer to the help instructions to resolve the issue, then recalibrate on the device.",
  "03004038":
    "Heatbed leveling failed. Please refer to the help instructions to resolve the issue, then recalibrate on the device.",
  "03004039":
    "The nozzle presence detection failed. Please refer to the help instructions to resolve the issue, then recalibrate on the device.",
  "03004042":
    "The Laser Safety Window is not properly installed. The task has been stopped.",
  "03004044":
    "The Flame Sensor is abnormal. The sensor may be short-circuited. Please troubleshoot the issue before starting a print job.",
  "0300404b": "Task aborted because the front door or top cover is open.",
  "0300404d":
    "The current temperature of the hotend, heatbed, or chamber is too high. Please wait for it to cool down to room temperature before restarting the task.",
  "03004050":
    "Liveview Camera calibration timeout; please restart the printer.",
  "03004052": "Blade Z-axis homing failed",
  "03004057":
    "Z-axis step loss detected. The task has stopped. Please check if there are any obstructions beneath the heatbed.",
  "03004066": "Calibration of motion precision failed.",
  "03004067": "Calibration result is over the threshold.",
  "03004068":
    "Step loss occurred during the motion accuracy enhancement process. Please try again.",
  "03004070": "Please heat the nozzle to above 170°C.",
  "03008000":
    'Printing was paused for unknown reason. You can select "Resume" to resume the print job.',
  "03008001":
    "Printing paused due to the pause command added to the printing file.",
  "03008003":
    "Spaghetti defects were detected by the AI Print Monitoring. Please check the quality of the printed model before continuing your print.",
  "03008005":
    "Toolhead front cover fell off. Please remount the front cover and check to make sure your print is going okay.",
  "03008007":
    "There was an unfinished print job when the printer lost power. If the model is still adhered to the build plate, you can try resuming the print job.",
  "03008008": "Nozzle temperature malfunction",
  "03008009": "Heatbed temperature malfunction",
  "0300800a":
    "A Filament pile-up was detected by AI Print Monitoring. Please clean filament from the waste chute.",
  "0300800b":
    "The cutter is stuck. Please make sure the cutter handle is out and check the filament sensor cable connection.",
  "0300800c":
    "Skipped step detected: auto-recover complete; please resume print and check if there are any layer shift problems.",
  "0300800d":
    'Detected that the extruder is not extruding normally. If the defects are acceptable, select "Resume" to resume the print job.',
  "0300800e":
    "The print file is not available. Please check to see if the storage media has been removed.",
  "0300800f": "The door seems to be open, so printing was paused.",
  "03008010": "The hotend cooling fan speed is abnormal.",
  "03008013":
    'Printing was paused by the user. You can select "Resume" to continue printing.',
  "03008014":
    'The nozzle is covered with filament, or the build plate is installed incorrectly. Please cancel this print and clean the nozzle or adjust the build plate according to the actual status. You can also select "Resume" to resume the print job.',
  "03008015":
    'The filament on external spool has run out; please load new filament. If the filament is loaded, please select "Resume".',
  "03008016":
    'The nozzle is clogged with filament. Please cancel this print and clean the nozzle or select "Resume" to resume the print job.',
  "03008017":
    'Foreign objects detected on heatbed. Please check and clean the heatbed. Then, select "Resume" to resume the print job.',
  "03008018": "Chamber temperature malfunction.",
  "03008019": "No build plate is placed.",
  "0300801a":
    "Filament extrusion error; please check the assistant for troubleshooting. After resolving the issue, decide whether to cancel or resume the print job based on the actual print status.",
  "0300801c":
    'The extrusion resistance is abnormal. The extruder may be clogged, please refer to the assistant, after trouble shooting, you can select "Resume" to resume the print job.',
  "0300801d":
    "The extruder servo motor position sensor is malfunctioning. Please power off the printer first and check if the connection cable is loose.",
  "0300801e":
    "The extrusion motor is overloaded, please check if the extruder is clogged or the filament is stuck in the tool head.",
  "03008021":
    "The nozzle may not be installed or not properly installed. Please ensure the nozzle is correctly installed before proceeding.",
  "03008022":
    "The heatbed may be obstructed while moving downward. Please clear any objects beneath the heatbed and check for any resistance or jamming during its movement.",
  "03008023":
    "XY motor homing failed during hotend holder homing. Please check for obstructions and retry.",
  "03008024":
    "Hotend holder homing blocked. Please check for obstructions and retry.",
  "03008025":
    "Hotend holder homing distance too long. Please inspect the timing belt and motor gear for looseness or damage.",
  "03008026":
    "Laser/Calibration mode: Please remove all hotends from the holder before retrying.",
  "03008027":
    "Hotend dropped from the holder during printing. Please return it to the original position before continuing.",
  "03008028":
    "Nozzle offset calibration sensor error. If using a single hotend or the calibration function is disabled, you may ignore this and continue printing; otherwise, it is recommended to check the sensor before proceeding.",
  "03008029":
    "MC–hotend rack communication error. Please check if the rack mainboard cable is loose.",
  "0300802a":
    "Hotend rack motor position sensor error. If the issue persists after retrying, restart the printer.",
  "0300802b":
    "Hotend rack motor error. Please check and remove any obstructions affecting rack movement before continuing.",
  "0300802c":
    "A nozzle-clumping sensor error has been detected. Please cancel the print and service the sensor, or disable clumping detection function and continue printing.",
  "03008041": "Platform detection timeout: please restart the printer.",
  "03008042": "Task paused because the door or top cover is open.",
  "03008043": "The laser module is abnormal.",
  "03008044": "Fire was detected inside the chamber.",
  "03008045": "Material detection timeout: please restart the printer.",
  "03008046": "Foreign object detect timeout: please restart the printer.",
  "03008047":
    "Quick-release lever detection time out: please restart the printer.",
  "03008048":
    "Laser Module unlock has timed out, and the task cannot proceed. Please restart the printer and try again.",
  "03008049": "The current plate is invalid.",
  "0300804a":
    "Emergency stop button improperly installed. Please reinstall according to the Wiki before proceeding.",
  "0300804b": "Task paused. The Laser Safety Window is open.",
  "0300804e":
    "This is a printing task. Please detach the Laser/Cutting Module from the Toolhead.",
  "0300804f":
    "The loading/unloading process is currently ongoing. Please stop the process or remove the laser/cutting module.",
  "03008050":
    "This device does not support the 40W Laser Module. Please remove it or replace it with a 10W Laser Module.",
  "03008051":
    "The cutting module has dropped or the cutting module cable is disconnected; please check the module.",
  "03008053":
    "Laser module detected. Please install the right nozzle correctly to ensure proper Laser Module Mounting Calibration.",
  "03008054": "Please place the paper required for Print Then Cut.",
  "03008055":
    "The module mounted on the toolhead does not match the task. Please install the correct module.",
  "03008056":
    "Laser module detected. Please remove the hotend from the hotend rack to prevent laser processing debris from affecting printing performance.",
  "03008060":
    "Please check whether the cutting platform is properly positioned and not shifted, then continue.",
  "03008061":
    "The mode of Airflow System failed to activate; check the air door condition.",
  "03008062":
    "The chamber temperature is too high. It may be due to high environmental temperature.",
  "03008063":
    "The chamber temperature is too high. Please open the top cover and front door to cool down.",
  "03008064":
    'The chamber temperature is too high. Please open the top cover and front door to cool down. (Open door detection for this print job will be set to "Notification" level)',
  "03008065":
    "The temperature of the MC module is too high. Please check the Wiki for possible explanations.",
  "0300806e":
    "Abnormal nozzle temperature control detected; the heating module may be damaged. Please disconnect the power immediately and stop using the device.",
  "0300806f":
    "Abnormal temperature rise detected on the heatbed. The heating module may be damaged. Please power off the device immediately and stop using it.",
  "03008070":
    "The chamber heater temperature is rising abnormally and the heating module may be damaged. Please power off the device immediately and stop using the device.",
  "03008071": "The Toolhead Enhanced Cooling Fan module is malfunctioning.",
  "0300807d":
    "Fire Extinguisher not detected, the automatic extinguishing function will be unavailable.",
  "0300807e":
    "Fire Extinguisher not detected, the automatic extinguishing function will be unavailable.",
  "0300807f": "Fire Extinguisher is malfunctioning.",
  "03008080": "Fire extinguisher motor reset failed.",
  "03008081":
    "Fire extinguisher cylinder not installed. Please confirm on the extinguisher page.",
  "03008082": "The Fire Extinguisher Gas Cylinder is empty.",
  "03008084":
    "The right hotend heatbreak temperature is too high, which may cause clogging. Please open the printer’s top cover and front door to reduce the chamber temperature, or lower the ambient temperature.",
  "0300c012": "Please heat the nozzle to above 170°C.",
  "0300c056":
    "A minor fire was detected inside the chamber, and the Auto Fire Extinguishing process has been aborted.",
  "0300c070":
    "The fire extinguisher has been detected and is ready for use after the laser module is connected.",
  "05004001":
    "Failed to connect to Bambu Cloud. Please check your network connection.",
  "05004002":
    "Unsupported print file path or name. Please resend the print job.",
  "05004003":
    "Printing stopped because the printer was unable to parse the file. Please resend your print job.",
  "05004004":
    "Device is busy and cannot start new task. Please wait for current task to complete before sending new task.",
  "05004005": "Print jobs are not allowed to be sent while updating firmware.",
  "05004006":
    "There is not enough free storage space for the print job. Restoring to factory settings can free up available space.",
  "05004007":
    "The device requires a repair upgrade, and printing is currently unavailable.",
  "05004008":
    "Starting printing failed; please power cycle the printer and resend the print job.",
  "05004009": "Print jobs are not allowed to be sent while updating logs.",
  "0500400a":
    "The file name is not supported. Please rename and restart the print job.",
  "0500400b":
    "There was a problem downloading a file. Please check your network connection and resend the print job.",
  "0500400c": "Please insert a MicroSD card and restart the print job.",
  "0500400d": "Please run a self-test and restart the print job.",
  "0500400e": "Printing was cancelled.",
  "0500400f":
    "AMS is initializing and cannot be upgraded at the moment. Please try again later.",
  "05004010":
    "AMS is drying and cannot be upgraded at the moment. Please try again later.",
  "05004011":
    "The printer is loading or unloading filament and cannot be upgraded at the moment. Please try again later.",
  "05004012":
    "The device is printing and cannot be upgraded at the moment. Please try again later.",
  "05004013":
    "AMS is in operation and cannot be upgraded at the moment. Please try again when it is idle.",
  "05004014":
    "Slicing for the print job failed. Please check your settings and restart the print job.",
  "05004015":
    "There is not enough free storage space for the print job. Please format or clear files from the MicroSD card to free up space.",
  "05004016":
    "The MicroSD Card is write-protected. Please replace the MicroSD Card.",
  "05004017": "Binding failed. Please retry or restart the printer and retry.",
  "05004018":
    "Binding configuration information parsing failed; please try again.",
  "05004019":
    "The printer has already been bound. Please unbind it and try again.",
  "0500401a":
    "Cloud access failed. Possible reasons include network instability caused by interference, inability to access the internet, or router firewall configuration restrictions. You can try moving the printer closer to the router or checking the router configuration before trying again.",
  "0500401b":
    "Cloud response is invalid. If you have tried multiple times and are still failing, please contact customer support.",
  "0500401c":
    "Cloud access is rejected. If you have tried multiple times and are still failing, please contact customer support.",
  "0500401d":
    "Cloud access failed, which may be caused by network instability due to interference. You can try moving the printer closer to the router before you try again.",
  "0500401e":
    "Cloud response is invalid. If you have tried multiple times and are still failing, please contact customer support.",
  "0500401f":
    "Authorization timed out. Please make sure that your phone or PC has access to the internet, and ensure that the Bambu Studio/Bambu Handy APP is running in the foreground during the binding operation.",
  "05004020":
    "Cloud access rejected. If you have tried multiple times and are still failing, please contact customer support.",
  "05004021":
    "Cloud access failed, which may be caused by network instability due to interference. You can try moving the printer closer to the router before you try again.",
  "05004022":
    "Cloud response is invalid. If you have tried multiple times and are still failing, please contact customer support.",
  "05004023":
    "Cloud access rejected. If you have tried multiple times and are still failing, please contact customer support.",
  "05004024":
    "Cloud access failed. Possible reasons include network instability caused by interference, inability to access the internet, or router firewall configuration restrictions. You can try moving the printer closer to the router or checking the router configuration before you try again.",
  "05004025":
    "Cloud response is invalid. If you have tried multiple times and are still failing, please contact customer support.",
  "05004026":
    "Cloud access rejected. If you have tried multiple times and are still failing, please contact customer support.",
  "05004027":
    "Cloud access failed; this may be caused by network instability due to interference. You can try moving the printer closer to the router before you try again.",
  "05004028":
    "Cloud response is invalid. If you have tried multiple times and are still failing, please contact customer support.",
  "05004029":
    "Cloud access is rejected. If you have tried multiple times and are still failing, please contact customer support.",
  "0500402a":
    "Failed to connect to the router, which may be caused by wireless interference or being too far away from the router. Please try again or move the printer closer to the router and try again.",
  "0500402b":
    "Router connection failed due to incorrect password. Please check the password and try again.",
  "0500402c":
    "Failed to obtain IP address, which may be caused by wireless interference resulting in data transmission failure or the DHCP address pool of the router being full. Please move the printer closer to the router and try again. If the issue persists, please check router settings to see whether the IP addresses have been exhausted.",
  "0500402d": "System exception",
  "0500402e":
    "System does not support the file system currently used by the USB flash drive. Please replace or format the USB flash drive to FAT32.",
  "0500402f":
    "USB flash drive sector data is damaged; please format it. If it still cannot be recognized, please replace the USB flash drive.",
  "05004030":
    "The device is currently upgrading. Please try again when it is idle.",
  "05004031":
    'The accessory firmware does not match the printer. Please upgrade it on the "Firmware" page.',
  "05004032":
    "Hotend Change System is busy; please perform the upgrade when it is idle.",
  "05004033":
    'The AMS firmware does not match the printer. Please upgrade it on the "Firmware" page.',
  "05004034":
    'The Laser Module firmware does not match the printer. Please upgrade it on the "Firmware" page.',
  "05004035":
    "The BirdsEye Camera is malfunctioning. Please try restarting the device. If the issue persists after multiple restarts, check the camera connection status or contact customer support.",
  "05004037":
    "Your sliced file is not compatible with current printer model. This file can't be printed on this printer.",
  "05004038":
    "The nozzle diameter in sliced file is not consistent with the current nozzle setting. This file can't be printed.",
  "05004039":
    "The current task does not allow the installation of the laser/cutting module, and the task has been halted.",
  "0500403a":
    "The current temperature is too low. In order to protect you and your printer, printing tasks, moving an axis and other operations are disabled. Please move the printer to an environment above 10 degrees Celsius.",
  "0500403b":
    "Laser/cutting tasks cannot be initiated on the machine at the moment. Please use the computer software to start the task.",
  "0500403c":
    "The nozzle setup does not match the slicing file. Please initiate the print after re-slicing.",
  "0500403d":
    "The toolhead module is not set up. Please set it up before initiating the task.",
  "0500403e": "The current tool head does not support initialization.",
  "0500403f":
    "Failed to download print job; please check your network connection.",
  "05004040":
    "The printer has reached its power limit. Please connect a dedicated power adapter to this AMS to enable drying.",
  "05004041": "The AMS drying cannot be started during printing.",
  "05004042":
    "Due to power limitations, starting AMS drying will pause current operations such as nozzle heating and fan running. Do you want to proceed with drying?",
  "05004043":
    "Due to power limitations, only one AMS is allowed to use the device's power for drying.",
  "05004044": "BirdsEye Camera malfunction: please contact customer support.",
  "05004045":
    "Hotend check in progress. This operation is temporarily unavailable. Please wait.",
  "05004046":
    "The print has stopped because the 3MF file is invalid. Please verify that the correct printer model was selected during slicing, or update Studio and re-slice the file.",
  "05004047":
    "The print has stopped because the available hotend quantity or model does not match the sliced file. Please verify the hotend model and quantity before restarting the print job.",
  "05004048":
    "The feeder module is offline. Please check if the feeder module connection cable is loose.",
  "05004049":
    "A feeder module replacement is detected. Please ensure that the corresponding extrusion gear and nozzle have been replaced, and manually update the nozzle type in the printer.",
  "05004050": "Error detected on the print board.",
  "05004051":
    "Dynamic arc fitting failed. Please re-slice the model before starting the print.",
  "05004052": "Error detected on the hot end.",
  "05004054": "Error detected on the mat.",
  "05004057":
    "The filament selected in the slicer requires a harder nozzle. Please replace the nozzle or adjust the filament settings before reprinting.",
  "0500405d":
    "Laser module Serial Number error: unable to calibrate or make project.",
  "05004065":
    "The task requires a Laser Platform, but the current one is a Cutting Platform. Please replace it, measure the material thickness in the software, and then restart the task.",
  "05004070":
    "The laser or cutter module is connected, so the device cannot initiate a 3D printing task.",
  "05004075":
    "No Laser Platform was detected, which may affect thickness measurement accuracy. Please place the laser platform correctly and ensure the rear markers are not blocked, then restart the thickness measurement in the software before initiating the task.",
  "05004076":
    "Please place the Laser Platform correctly and ensure the rear markers are not blocked, then restart the thickness measurement in the software before initiating the task.",
  "05004095":
    "No print plate detected. Please place it correctly and recalibrate on the device.",
  "05004097":
    "The device cannot detect the Laser Module. Please reconnect the module cable or restart the printer.",
  "05004098":
    "The device cannot detect AMS A. Please reconnect the AMS cable or restart the printer.",
  "05004099":
    'The firmware of Cutting Module does not match the printer; the device cannot continue working. Please upgrade it on the "Firmware" page.',
  "0500409a":
    'The firmware of Air Pump does not match the printer; the device cannot continue working. Please upgrade it on the "Firmware" page.',
  "0500409b":
    'The firmware of Laser Module does not match the printer; the device cannot continue working. Please upgrade it on the "Firmware" page.',
  "0500409d":
    'The firmware of AMS A does not match the printer; the device cannot continue working. Please upgrade it on the "Firmware" page.',
  "0500409e":
    "The device cannot detect the Cutting Module. Please reconnect the module cable or restart the printer.",
  "0500409f":
    "The device cannot detect the Air Pump.  Please reconnect the module cable or restart the printer.",
  "050040a0":
    "The device cannot detect Laser Fourth Axis.  Please reconnect the module cable or restart the printer.",
  "050040a1":
    "The device cannot detect Fire Extinguisher.  Please reconnect the module cable or restart the printer.",
  "050040a2":
    "The device cannot detect the External Exhaust Fan.  Please restart the printer or reconnect the fan cable.",
  "050040a6":
    "File download failed due to missing certificates. Please check the Fleet Hub certificate configuration and restart the printer before trying again",
  "050040a7":
    "The device cannot detect the Filament Track Switch.  Please restart the printer or reconnect the cable.",
  "050040a8":
    'The device firmware requires a repair upgrade, and the current operation cannot be performed. Please upgrade it on the "Firmware" page.',
  "050040c0":
    "Communication error detected with AMS, AMS Lite or AMS HT. Please reconnect the module cable or restart the printer when it is idle.",
  "05008013":
    "The print file is not available. Please check to see if the storage media has been removed.",
  "05008030": "",
  "05008036":
    "Your sliced file is not consistent with the current printer model. Continue?",
  "0500803c":
    "The left and right nozzle setting does not match the slicing file. Continuing to print may affect print quality. It is recommended to re-slice before starting the print.",
  "05008040":
    "Toolhead front cover is detached. Moving the toolhead may damage the printer. Do you want to continue?",
  "05008041":
    "The filament in hotend is too cold. Extrusion may damage the extruder. Still feeding in/out the filament?",
  "05008051":
    "Detected build plate is not the same as the Gcode file. Please adjust slicer settings or use the correct plate.",
  "05008053":
    "Nozzle mismatch was detected during printing. Please initiate the print after re-slicing, or continue printing after replacing the correct nozzle. Caution: the hotend temperature is high.",
  "05008055":
    "Laser module is installed, but a Cutting Platform is detected. Please place a Laser Platform and perform laser calibration.",
  "05008056":
    "Cutting module is installed, but the laser platform is detected. Please place the cutting platform for calibration.",
  "05008057":
    "The filament hardness selected in the slicer exceeds the current nozzle hardness. Continuing the print may cause nozzle wear, leading to leakage and unstable flow. Please proceed with caution.",
  "05008058":
    "Please place the light grip cutting mat correctly and ensure the marker is exposed.",
  "05008059":
    "Cutting platform base is not correctly aligned. Please ensure that the four corners of the platform are aligned with the heatbed.",
  "0500805a": "Please place the cutting mat on cutting protection base.",
  "0500805b":
    "The cutting mat type is unknown; please replace it with the correct cutting mat.",
  "0500805c":
    "The grip cutting mat type does not match; please place a LightGrip cutting mat.",
  "0500805e":
    "Cutting module Serial Number error: unable to calibrate or make project.",
  "05008060":
    "The current module on toolhead does not meet requirements. Please replace the module as per the on-screen instructions.",
  "05008061":
    "No print plate detected. Please make sure it is placed correctly.",
  "05008062":
    "The print plate marker was not detected. Please confirm the print plate is correctly positioned on the heatbed with all four corners aligned, and the marker is visible. If strong light is shining on the print sheet, consider closing the front door and blocking external light sources.",
  "05008063":
    "The platform is not detected during calibration; please make sure the Laser Platform is properly placed.",
  "05008064":
    "Please place the Laser Platform correctly and ensure the rear markers are not blocked for laser calibration.",
  "05008066":
    "The task requires a Cutting Platform, but the current one is a Laser Platform. Please replace it with a Cutting Platform (Cutting Protection Base + LightGrip cutting mat).",
  "05008067":
    "Please place a LightGrip cutting mat on the cutting protection base.",
  "05008068":
    "Please place the strong grip cutting mat correctly and ensure the marker is exposed.",
  "05008069":
    "Unable to recognize the left and right hotend. It might be a non-official hotend, or the hotend mark could be dirty. Please manually set the hotend type.",
  "0500806a":
    "Unable to recognize the left and right hotend. It might be a non-official hotend, or the hotend mark could be dirty. Please set hotend type before next print.",
  "0500806b":
    "Quick-release Lever is not locked. Please press down the external toolhead module to ensure it is properly seated, then push down the level to lock it in place.",
  "0500806c":
    "Please place the cutting platform correctly and ensure the marker is exposed.",
  "0500806d": "Material not detected. Please confirm placement and continue.",
  "0500806e":
    "Foreign objects detected on heatbed; please check and clean up the heatbed.",
  "0500806f":
    "The grip cutting mat type does not match; please place a StrongGrip cutting mat.",
  "05008071":
    "No cutting platform was detected. Please confirm that it has been correctly placed.",
  "05008072": "Live View camera is blocked",
  "05008073":
    "Heatbed limit block is obstructed or contaminated. Please clean and ensure the limit block is visible, otherwise platform position offset detection may be inaccurate.",
  "05008074":
    "The Laser Platform is offset. Please ensure that the four corners of the platform are aligned with the heatbed, and the marker is not obstructed.",
  "05008077":
    "The visual marker was not detected. Please ensure the paper is properly placed.",
  "05008078":
    "Current material does not match the sliced file settings. Please load the correct material and ensure the QR code on the material is not damaged or dirty.",
  "05008079":
    "Please place the Laser Test Material (350g paperboard) and position support strips underneath to prevent material warping.",
  "0500807a":
    "The foreign object detection function is not working. You can continue the task or check the assistant for troubleshooting.",
  "0500807b":
    "Please place the cutting platform (cutting protection base + LightGrip cutting mat).",
  "0500807c":
    "Please place the cutting platform (cutting protection base + StrongGrip cutting mat).",
  "0500807d":
    "This task requires a Cutting Platform, but the current one is a Laser Platform. Please replace it with a Cutting Platform (Cutting Protection Base + StrongGrip Cutting Mat).",
  "0500807e":
    "Please place a StrongGrip cutting mat on the cutting protection base.",
  "05008080": "The left and right hotend is not installed.",
  "05008081": "The left and right hotend is not installed.",
  "05008082":
    "Please remove the protective film on the Opaque Glossy Acrylic before processing",
  "05008083":
    "Material is not allowed in Mounting Calibration. Please remove the material from the platform.",
  "05008084": "The Live View Camera is dirty; please clean it and continue.",
  "05008085": "Toolhead camera is obstructed",
  "05008086":
    "Toolhead Camera is dirty, which affects the AI function; please clean the lens surface.",
  "05008087": "BirdsEye camera is obstructed",
  "05008088": "The Birdseye Camera is dirty",
  "05008089":
    "Task paused due to Presence Check failed. Please check the printer to continue.",
  "0500808a":
    "The BirdsEye Camera is installed offset. Please refer to the assistant to reinstall it.",
  "0500808b":
    "The BirdsEye Camera setup failed. Please remove all objects and the mat on the heatbed to ensure the heatbed markers are visible. Meanwhile, please ensure the BirdsEye Camera is installed correctly and remove any obstructions that may block the camera's view.",
  "0500808c":
    "Detected build plate offset. Please align the build plate with the heatbed, and then continue.",
  "0500808d":
    "The Cutting Module offset calibration failed, which may result in inaccurate cuts. Please ensure the cutting material is properly positioned and check whether the cutting blade tip is worn.",
  "0500808e":
    "BirdsEye Camera initialization failed. The toolhead camera did not detect the Heatbed features. Please clean the Heatbed, remove all objects and pads, and ensure the bed markings are visible. Check Assistant for a detailed solution.",
  "0500808f":
    "Nozzle camera lens is dirty, affecting AI monitoring. Clean the lens with a non-woven cloth and a small amount of alcohol. Beware of hotend heat; wait for it to cool before handling.",
  "05008090":
    "Please attach the 80g White Printing Paper to the center area of the platform.",
  "05008091":
    "The Cutting Module offset calibration failed, which may result in inaccurate cuts. Please ensure the 80g white printer paper(letter paper thickness) is properly positioned and check whether the cutting blade tip is worn.",
  "05008092":
    "Toolhead Camera initialization failed. This print can still continue, but some AI functions will be disabled. If you encounter this issue again after restarting, please contact customer support.",
  "05008093":
    "The nozzle silicone sleeve is not installed; there is a risk of temperature control failure. Please install it correctly and try again.",
  "05008098":
    "No material detected. Please confirm material placement and continue.",
  "05008099":
    "AI detected potential print shift or collapse. Check print status and take action. Clean build plate or apply adhesive to improve adhesion.",
  "0500809a":
    "Please replace the Vision Encoder board with the print plate to avoid damage during calibration.",
  "0500809b":
    "Build plate not properly positioned, may collide with the waste chute. Please reposition build plate and align with heatbed.",
  "050080a0":
    "The visual encoder board was not detected. Please check if the board is properly placed and aligned at all four corners, and ensure the positioning markings are clear and free from wear.",
  "0500c010":
    "USB flash drive read-write exception; please reinsert or replace it.",
  "0500c011": "",
  "0500c032":
    "Laser/Cutting module connected to the toolhead. The drying process has been automatically stopped.",
  "0500c036":
    "This is a printing task. Please detach the Laser/Cutting Module from the Toolhead.",
  "0500c04a":
    "AMS is calibrating, reading RFID or loading/unloading material, unable to initiate drying process, please wait.",
  "0500c04b":
    "Filament in AMS outlet, the high drying temperature may cause AMS blockage. Drying cannot be started. Please unload the filament first.",
  "0500c04c":
    "The AMS is currently drying. Please do not start the process again.",
  "0500c04d":
    "The device is currently in laser or cutting mode and cannot start drying. Please do not initiate the drying process.",
  "0500c04e":
    "Please connect a power adapter to the AMS-HT before starting the drying process.",
  "0500c04f":
    "The AMS is drying and cannot perform this operation at the moment.",
  "0500c07f":
    "Device is busy and cannot perform this operation. To proceed, please pause or stop the current task.",
  "0500c080":
    "The extruder is currently running and cannot perform this operation. To proceed, please pause or stop the current task first.",
  "05014017": "Binding failed. Please retry or restart the printer and retry.",
  "05014018":
    "Binding configuration information parsing failed; please try again.",
  "05014019":
    "The printer has already been bound. Please unbind it and try again.",
  "0501401a":
    "Cloud access failed. Possible reasons include network instability caused by interference, inability to access the internet, or router firewall configuration restrictions. You can try moving the printer closer to the router or checking the router configuration before trying again.",
  "0501401b":
    "Cloud response is invalid. If you have tried multiple times and are still failing, please contact customer support.",
  "0501401c":
    "Cloud access is rejected. If you have tried multiple times and are still failing, please contact customer support.",
  "0501401d":
    "Cloud access failed, which may be caused by network instability due to interference. You can try moving the printer closer to the router before you try again.",
  "0501401e":
    "Cloud response is invalid. If you have tried multiple times and are still failing, please contact customer support.",
  "0501401f":
    "Authorization timed out. Please make sure that your phone or PC has access to the internet, and ensure that the Bambu Studio/Bambu Handy APP is running in the foreground during the binding operation.",
  "05014020":
    "Cloud access rejected. If you have tried multiple times and are still failing, please contact customer support.",
  "05014021":
    "Cloud access failed, which may be caused by network instability due to interference. You can try moving the printer closer to the router before you try again.",
  "05014022":
    "Cloud response is invalid. If you have tried multiple times and are still failing, please contact customer support.",
  "05014023":
    "Cloud access rejected. If you have tried multiple times and are still failing, please contact customer support.",
  "05014024":
    "Cloud access failed. Possible reasons include network instability caused by interference, inability to access the internet, or router firewall configuration restrictions. You can try moving the printer closer to the router or checking the router configuration before you try again.",
  "05014025":
    "Cloud response is invalid. If you have tried multiple times and are still failing, please contact customer support.",
  "05014026":
    "Cloud access rejected. If you have tried multiple times and are still failing, please contact customer support.",
  "05014027":
    "Cloud access failed; this may be caused by network instability due to interference. You can try moving the printer closer to the router before you try again.",
  "05014028":
    "Cloud response is invalid. If you have tried multiple times and are still failing, please contact customer support.",
  "05014029":
    "Cloud access is rejected. If you have tried multiple times and are still failing, please contact customer support.",
  "05014031":
    "Device discovery binding is in progress, and the QR code cannot be displayed on the screen. You can wait for the binding to finish or abort the device discovery binding process in the APP/Studio and retry scanning the QR code on the screen for binding.",
  "05014032":
    "QR code binding is in progress, so device discovery binding cannot be performed. You can scan the QR code on the screen for binding or exit the QR code display page on screen and try device discovery binding.",
  "05014033":
    "Your APP region does not match with your printer; please download the APP in the corresponding region and register your account again.",
  "05014034":
    "The slicing progress has not been updated for a long time, and the printing task has exited. Please confirm the parameters and reinitiate printing.",
  "05014035":
    "The device is in the process of binding and cannot respond to new binding requests.",
  "05014038":
    "The regional settings do not match the printer; please check the printer's regional settings.",
  "05014039": "Device login has expired; please try to bind again.",
  "05014098":
    "The device cannot detect AMS B. Please reconnect the AMS cable or restart the printer.",
  "0501409d":
    'The firmware of AMS B does not match the printer; the device cannot continue working. Please upgrade it on the "Firmware" page.',
  "05024001":
    "Current filament will be used in this print job. Settings cannot be changed.",
  "05024002":
    "Please go to “Settings > Calibration” to run the Motion Accuracy Enhancement Calibration before turning on Motion Accuracy Enhancement mode.",
  "05024003":
    "The printer is currently printing and the motion accuracy enhancement feature cannot be turned on or off.",
  "05024004":
    "Some features are not supported by the current device. Please check the Studio feature settings or update the firmware to the latest version.",
  "05024005":
    "The AMS has not been calibrated yet, so printing cannot be initiated.",
  "05024006":
    "Unknown module detected, please try updating the firmware to the latest version.",
  "05024007": "",
  "05024008": "",
  "05024009": "",
  "0502400a": "",
  "0502400b": "",
  "0502400c": "",
  "0502400d":
    "Failed to start a new task: filament loading/unloading not completed.",
  "0502400e":
    "Failed to start a new task: The nozzle cold pull was not completed.",
  "05024013":
    "This device is not compatible with the 40W laser module. Please replace it with a 10W laser module or remove it.",
  "05024015":
    "Hotend authentication failed. Please switch the hotend or restart the printer.",
  "05024016":
    "No available hotend was detected in the induction hotend holder or the hotend rack. Please install a hotend and try again.",
  "05024017":
    'The task failed due to a timeout on the induction hotend switch. Please go to the "Hotend & Rack" page and click "Read All" to switch manually.',
  "05024018":
    "The hotend rack has not been calibrated, and hotend switching cannot be performed. Please complete the rack calibration on the device.",
  "05024019":
    "The device is busy and cannot perform hotend rack tasks at this moment. Please try again later.",
  "05024020":
    "The hotend rack is fully occupied. Please remove one hotend before proceeding.",
  "05024021":
    "Failed to read induction hotend information. Please replace the hotend or restart the printer.",
  "05024023":
    'Induction hotend recognition error detected. Please go to the "Hotends & Rack" page and click "Read All" to re-detect. If the issue persists, try updating the firmware on the "Firmware" page.',
  "05024027":
    "The current AMS does not support drying while printing. Please connect to the network and update the AMS firmware on the “Firmware” page.",
  "05024029":
    "This filament is only supported for printing with the left extruder.",
  "0502402d":
    "Printing stopped because the printer was unable to parse the 3mf file. Please resend your print job.",
  "0502402e":
    "Printing stopped because the printer was unable to parse the 3mf file. Please resend your print job.",
  "0502402f":
    "Printing stopped because the printer was unable to parse the 3mf file. Please resend your print job.",
  "05024030":
    "Printing stopped because the printer was unable to parse the 3mf file. Please resend your print job.",
  "05024035":
    "With the current nozzle diameter, This filament is only supported for printing with the left extruder.",
  "05024098":
    "The device cannot detect AMS C. Please reconnect the AMS cable or restart the printer.",
  "0502409d":
    'The firmware of AMS C does not match the printer; the device cannot continue working. Please upgrade it on the "Firmware" page.',
  "05028022":
    "Induction hotend verification failed. Please replace the hotend and try again.",
  "0502802a":
    "Using this filament with the auxiliary extruder involves a high risk and may result in print failure or device malfunction.",
  "0502802b":
    "Using this filament with the auxiliary extruder may affect print quality.",
  "05028036":
    "With the current nozzle diameter, Using this filament with the auxiliary extruder involves a high risk and may result in print failure or device malfunction.",
  "05028037":
    "With the current nozzle diameter, Using this filament with the auxiliary extruder may affect print quality.",
  "0502c00f": "The device is busy and cannot perform nozzle identification.",
  "0502c010":
    "Due to printer power limitations, printing, calibration, controls and other actions cannot be performed during AMS drying. Please stop the drying process before proceeding with any other operation.",
  "0502c011":
    "Currently in 2D production mode. Please continue the operation on the printer",
  "0502c012": "The task cannot be paused.",
  "0502c014":
    "The AMS Remaining Filament Estimation is enabled by default and cannot be disabled.",
  "0502c024":
    "The flow dynamic calibration records have exceeded the storage limit. Please delete some historical records in the slicer software before adding new calibration data.",
  "0502c025":
    'A hotend information update was detected during nozzle offset calibration. Please go to the "Hotends & Rack" page and click “Read All” to reidentify. If the issue persists, try updating from the “Firmware” page.',
  "0502c026":
    "The device is busy with the current task and cannot perform this operation for now. Please try again later.",
  "0502c028":
    "The filament currently loaded in the extruder does not support manual feeding.",
  "0502c031":
    "Please check and remove any printed parts or debris from the heatbed surface before continuing the cold pull.",
  "0502c032":
    "Please check and remove any printed parts or debris from the heatbed surface and underside before continuing the drying process.",
  "0502c033":
    "While retracting filament on the auxiliary extruder, manually collect it promptly to prevent it from tangling on the spool.",
  "0502c034":
    "Extruder switch failed and the current action was not executed. Please go to the Extruder screen, check and complete the extruder switch, and then try again.",
  "05034098":
    "The device cannot detect AMS D. Please reconnect the AMS cable or restart the printer.",
  "0503409d":
    'The firmware of AMS D does not match the printer; the device cannot continue working. Please upgrade it on the "Firmware" page.',
  "05804096":
    "The device cannot detect AMS-HT A. Please reconnect the AMS-HT cable or restart the printer.",
  "0580409c":
    'The firmware of AMS-HT A does not match the printer; the device cannot continue working. Please upgrade it on the "Firmware" page.',
  "05814096":
    "The device cannot detect AMS-HT B. Please reconnect the AMS-HT cable or restart the printer.",
  "0581409c":
    'The firmware of AMS-HT B does not match the printer; the device cannot continue working. Please upgrade it on the "Firmware" page.',
  "05824096":
    "The device cannot detect AMS-HT C. Please reconnect the AMS-HT cable or restart the printer.",
  "0582409c":
    'The firmware of AMS-HT C does not match the printer; the device cannot continue working. Please upgrade it on the "Firmware" page.',
  "05834096":
    "The device cannot detect AMS-HT D. Please reconnect the AMS-HT cable or restart the printer.",
  "0583409c":
    'The firmware of AMS-HT D does not match the printer; the device cannot continue working. Please upgrade it on the "Firmware" page.',
  "05844096":
    "The device cannot detect AMS-HT F. Please reconnect the AMS-HT cable or restart the printer.",
  "0584409c":
    'The firmware of AMS-HT E does not match the printer; the device cannot continue working. Please upgrade it on the "Firmware" page.',
  "05854096":
    "The device cannot detect AMS-HT E. Please reconnect the AMS-HT cable or restart the printer.",
  "0585409c":
    'The firmware of AMS-HT F does not match the printer; the device cannot continue working. Please upgrade it on the "Firmware" page.',
  "05864096":
    "The device cannot detect AMS-HT G. Please reconnect the AMS-HT cable or restart the printer.",
  "0586409c":
    'The firmware of AMS-HT G does not match the printer; the device cannot continue working. Please upgrade it on the "Firmware" page.',
  "05874096":
    "The device cannot detect AMS-HT H. Please reconnect the AMS-HT cable or restart the printer.",
  "0587409c":
    'The firmware of AMS-HT H does not match the printer; the device cannot continue working. Please upgrade it on the "Firmware" page.',
  "05fe403c":
    "The left nozzle setting does not match the slicing file. Continuing to print may affect print quality. It is recommended to re-slice before starting the print.",
  "05fe4094":
    "The left hotend is not installed. Please install the hotend and recalibrate.",
  "05fe803c":
    "The left nozzle setting does not match the slicing file. Continuing to print may affect print quality. It is recommended to re-slice before starting the print.",
  "05fe8053":
    "The left nozzle is not matched with slicing file. Please initiate the print after re-slicing, or continue printing after replacing the correct nozzle. Caution: the hotend temperature is high.",
  "05fe8069":
    "Unable to recognize the left hotend. It might be a non-official hotend, or the hotend mark could be dirty. Please manually set the hotend type.",
  "05fe806a":
    "Unable to recognize the left hotend. It might be a non-official hotend, or the hotend mark could be dirty. Please set hotend type before next print.",
  "05fe8080": "The left hotend is not installed.",
  "05fe8081": "The left hotend is not installed.",
  "05ff403c":
    "The right (Aux) nozzle setting does not match the slicing file. Continuing to print may affect print quality. It is recommended to re-slice before starting the print.",
  "05ff4094":
    "The right hotend is not installed. Please install the hotend and recalibrate.",
  "05ff803c":
    "The right (Aux) nozzle setting does not match the slicing file. Continuing to print may affect print quality. It is recommended to re-slice before starting the print.",
  "05ff8053":
    "The right nozzle is not matched with slicing file. Please initiate the print after re-slicing, or continue printing after replacing the correct nozzle. Caution: the hotend temperature is high.",
  "05ff8069":
    "Unable to recognize the right hotend. It might be a non-official hotend, or the hotend mark could be dirty. Please manually set the hotend type.",
  "05ff806a":
    "Unable to recognize the right hotend. It might be a non-official hotend, or the hotend mark could be dirty. Please set hotend type before next print.",
  "05ff8080": "The right hotend is not installed.",
  "05ff8081": "The right hotend is not installed.",
  "07004001":
    "The AMS has been disabled for a print, but it still has filament loaded. Please unload the AMS filament and switch to the spool holder filament for printing.",
  "07004025": "Failed to read the filament information.",
  "07008001": "Failed to cut the filament. Please check the cutter.",
  "07008002": "The cutter is stuck. Please make sure the cutter handle is out.",
  "07008003":
    "Failed to pull out the filament from the extruder. This might be caused by clogged extruder or filament broken inside the extruder.",
  "07008004":
    "AMS failed to pull back filament. This could be due to a stuck spool or the end of the filament being stuck in the path.",
  "07008005":
    "The AMS failed to send out filament. You can clip the end of your filament flat, and reinsert. If this message persists, please check the PTFE tubes in AMS for any signs of wear and tear.",
  "07008006":
    "Unable to feed filament into the extruder. This could be due to an entangled filament or a stuck spool. If not, please check if the AMS PTFE tube is connected.",
  "07008007":
    "Failed to extrude the filament. Please check if the extruder clogged.",
  "0700800a":
    "PTFE tube disconnection detected. Please check if the PTFE tube from AMS A to the extruder is properly connected.",
  "07008010":
    "The AMS assist motor is overloaded. This could be due to entangled filament or a stuck spool.",
  "07008011":
    "AMS filament ran out. Please insert a new filament into the same AMS slot.",
  "07008012":
    'Failed to get AMS mapping table; please select "Resume" to retry.',
  "07008013":
    "Timeout purging old filament: Please check if the filament is stuck or the extruder is clogged.",
  "07008016":
    "The extruder is not extruding normally; please refer to the Assistant. After trouble shooting. If the defects are acceptable, please resume.",
  "07008017":
    "AMS A is drying. Please stop drying process before loading/unloading material.",
  "07008018":
    "Failed to get filament-hotend mapping table from the slicing file, please retry.",
  "07008021": "AMS setup failed; please refer to the assistant.",
  "07008023":
    "AMS A cooling failed. The ambient temperature may be too high. Please operate the device in a suitable environment.",
  "07008026": "AMS set up failed. Please check the assistant for details.",
  "07008027":
    "Filament track channel switching failed. Possible causes include filament jamming or component damage.",
  "07008028":
    "Failed to feed filament to the extruder. Possible causes include an incorrect AMS–filament track switch binding, tangled filament, a stuck spool, or a disconnected PTFE tube. Please check the assistant for details.",
  "07008029":
    "This print requires a Filament Track Switch, but it is currently offline. Please connect the Filament Track Switch and retry.",
  "0700802a":
    "The Filament Track Switch was detected while the printer was not idle. Please unplug the Filament Track Switch and reconnect it after the printer enters the idle state.",
  "07008030": "Hotend pre-swap check failed.",
  "07008031": "Failed to lock the induction hotend.",
  "07008032": "Failed to unlock the induction hotend.",
  "07008033": "Failed to nest hotend into slot 1 on the rack.",
  "07008034": "Failed to fetch induction hotend from slot 1 on the rack.",
  "07008035":
    "Hotend Rack coarse homing failed. Please check for obstructions or if the build plate is misaligned.",
  "07008036":
    "Hotend rack coarse homing failed. Please check for obstructions or if the build plate is misaligned.",
  "07008037":
    "Hotend type mismatch detected during printing. Please replace the hotend in slot 1 on the rack with the type specified in the slicer before continuing the print.",
  "0700c008":
    "AMS used for the current print is disconnected. Check the connection. Printing will resume automatically after reconnection.",
  "0700c069":
    "An error occurred during AMS A drying. Please go to Assistant for more details.",
  "0700c06a":
    "AMS A is reading RFID. Unable to start drying. Please try again later.",
  "0700c06b":
    "AMS A is changing filament. Unable to start drying. Please try again later.",
  "0700c06c":
    "AMS A is in Feed Assist Mode. Unable to start drying. Please try again later.",
  "0700c06d":
    "AMS A is assisting in filament insertion. Unable to start drying. Please try again later.",
  "0700c06e":
    "AMS A motor is performing self-test. Unable to start drying. Please try again later.",
  "07014001":
    "Filament is still loaded from the AMS after it has been disabled. Please unload the filament, load from the spool holder, and restart printing.",
  "07014025": "Failed to read the filament information.",
  "07018001": "Failed to cut the filament. Please check the cutter.",
  "07018002": "The cutter is stuck. Please make sure the cutter handle is out.",
  "07018003":
    "Failed to pull out the filament from the extruder. This might be caused by clogged extruder or filament broken inside the extruder.",
  "07018004":
    "AMS failed to pull back filament. This could be due to a stuck spool or the end of the filament being stuck in the path.",
  "07018005":
    "The AMS failed to send out filament. You can clip the end of your filament flat, and reinsert. If this message persists, please check the PTFE tubes in AMS for any signs of wear and tear.",
  "07018006":
    "Unable to feed filament into the extruder. This could be due to an entangled filament or a stuck spool. If not, please check if the AMS PTFE tube is connected.",
  "07018007":
    "Failed to extrude the filament. Please check if the extruder clogged.",
  "0701800a":
    "PTFE tube disconnection detected. Please check if the PTFE tube from AMS B to the extruder is properly connected.",
  "07018010":
    "The AMS assist motor is overloaded. This could be due to entangled filament or a stuck spool.",
  "07018011":
    "AMS filament ran out. Please insert a new filament into the same AMS slot.",
  "07018012":
    'Failed to get AMS mapping table; please select "Resume" to retry.',
  "07018013":
    "Timeout purging old filament: Please check if the filament is stuck or the extruder is clogged.",
  "07018016":
    "The extruder is not extruding normally; please refer to the Assistant. After trouble shooting. If the defects are acceptable, please resume.",
  "07018017":
    "AMS B is drying. Please stop drying process before loading/unloading material.",
  "07018018":
    "Failed to get filament-hotend mapping table from the slicing file, please retry.",
  "07018021": "AMS setup failed; please refer to the assistant.",
  "07018023":
    "AMS B cooling failed. The ambient temperature may be too high. Please operate the device in a suitable environment.",
  "07018026": "AMS set up failed. Please check the assistant for details.",
  "07018027":
    "Filament track channel switching failed. Possible causes include filament jamming or component damage.",
  "07018028":
    "Failed to feed filament to the extruder. Possible causes include an incorrect AMS–filament track switch binding, tangled filament, a stuck spool, or a disconnected PTFE tube. Please check the assistant for details.",
  "07018029":
    "This print requires a Filament Track Switch, but it is currently offline. Please connect the Filament Track Switch and retry.",
  "0701802a":
    "The Filament Track Switch was detected while the printer was not idle. Please unplug the Filament Track Switch and reconnect it after the printer enters the idle state.",
  "07018030": "Hotend pre-swap check failed.",
  "07018033": "Failed to nest hotend into slot 2 on the rack.",
  "07018034": "Failed to fetch induction hotend from slot 2 on the rack.",
  "07018037":
    "Hotend type mismatch detected during printing. Please replace the hotend in slot 2 on the rack with the type specified in the slicer before continuing the print.",
  "0701c008":
    "AMS used for the current print is disconnected. Check the connection. Printing will resume automatically after reconnection.",
  "0701c069":
    "An error occurred during AMS B drying. Please go to Assistant for more details.",
  "0701c06a":
    "AMS B is reading RFID. Unable to start drying. Please try again later.",
  "0701c06b":
    "AMS B is changing filament. Unable to start drying. Please try again later.",
  "0701c06c":
    "AMS B is in Feed Assist Mode. Unable to start drying. Please try again later.",
  "0701c06d":
    "AMS B is assisting in filament insertion. Unable to start drying. Please try again later.",
  "0701c06e":
    "AMS B motor is performing self-test. Unable to start drying. Please try again later.",
  "07024001":
    "Filament is still loaded from the AMS after it has been disabled. Please unload the filament, load from the spool holder, and restart printing.",
  "07024025": "Failed to read the filament information.",
  "07028001": "Failed to cut the filament. Please check the cutter.",
  "07028002": "The cutter is stuck. Please make sure the cutter handle is out.",
  "07028003":
    "Failed to pull out the filament from the extruder. This might be caused by clogged extruder or filament broken inside the extruder.",
  "07028004":
    "AMS failed to pull back filament. This could be due to a stuck spool or the end of the filament being stuck in the path.",
  "07028005":
    "The AMS failed to send out filament. You can clip the end of your filament flat, and reinsert. If this message persists, please check the PTFE tubes in AMS for any signs of wear and tear.",
  "07028006":
    "Unable to feed filament into the extruder. This could be due to an entangled filament or a stuck spool. If not, please check if the AMS PTFE tube is connected.",
  "07028007":
    "Failed to extrude the filament. Please check if the extruder clogged.",
  "0702800a":
    "PTFE tube disconnection detected. Please check if the PTFE tube from AMS C to the extruder is properly connected.",
  "07028010":
    "The AMS assist motor is overloaded. This could be due to entangled filament or a stuck spool.",
  "07028011":
    "AMS filament ran out. Please insert a new filament into the same AMS slot.",
  "07028012":
    'Failed to get AMS mapping table; please select "Resume" to retry.',
  "07028013":
    "Timeout purging old filament: Please check if the filament is stuck or the extruder is clogged.",
  "07028016":
    "The extruder is not extruding normally; please refer to the Assistant. After trouble shooting. If the defects are acceptable, please resume.",
  "07028017":
    "AMS C is drying. Please stop drying process before loading/unloading material.",
  "07028018":
    "Failed to get filament-hotend mapping table from the slicing file, please retry.",
  "07028021": "AMS setup failed; please refer to the assistant.",
  "07028023":
    "AMS C cooling failed. The ambient temperature may be too high. Please operate the device in a suitable environment.",
  "07028026": "AMS set up failed. Please check the assistant for details.",
  "07028027":
    "Filament track channel switching failed. Possible causes include filament jamming or component damage.",
  "07028028":
    "Failed to feed filament to the extruder. Possible causes include an incorrect AMS–filament track switch binding, tangled filament, a stuck spool, or a disconnected PTFE tube. Please check the assistant for details.",
  "07028029":
    "This print requires a Filament Track Switch, but it is currently offline. Please connect the Filament Track Switch and retry.",
  "0702802a":
    "The Filament Track Switch was detected while the printer was not idle. Please unplug the Filament Track Switch and reconnect it after the printer enters the idle state.",
  "07028030": "Hotend pre-swap check failed.",
  "07028033": "Failed to nest hotend into slot 3 on the rack.",
  "07028034": "Failed to fetch induction hotend from slot 3 on the rack.",
  "07028037":
    "Hotend type mismatch detected during printing. Please replace the hotend in slot 3 on the rack with the type specified in the slicer before continuing the print.",
  "0702c008":
    "AMS used for the current print is disconnected. Check the connection. Printing will resume automatically after reconnection.",
  "0702c069":
    "An error occurred during AMS C drying. Please go to Assistant for more details.",
  "0702c06a":
    "AMS C is reading RFID. Unable to start drying. Please try again later.",
  "0702c06b":
    "AMS C is changing filament. Unable to start drying. Please try again later.",
  "0702c06c":
    "AMS C is in Feed Assist Mode. Unable to start drying. Please try again later.",
  "0702c06d":
    "AMS C is assisting in filament insertion. Unable to start drying. Please try again later.",
  "0702c06e":
    "AMS C motor is performing self-test. Unable to start drying. Please try again later.",
  "07034001":
    "Filament is still loaded from the AMS after it has been disabled. Please unload the filament, load from the spool holder, and restart printing.",
  "07034025": "Failed to read the filament information.",
  "07038001": "Failed to cut the filament. Please check the cutter.",
  "07038002": "The cutter is stuck. Please make sure the cutter handle is out.",
  "07038003":
    "Failed to pull out the filament from the extruder. This might be caused by clogged extruder or filament broken inside the extruder.",
  "07038004":
    "AMS failed to pull back filament. This could be due to a stuck spool or the end of the filament being stuck in the path.",
  "07038005":
    "The AMS failed to send out filament. You can clip the end of your filament flat, and reinsert. If this message persists, please check the PTFE tubes in AMS for any signs of wear and tear.",
  "07038006":
    "Unable to feed filament into the extruder. This could be due to an entangled filament or a stuck spool. If not, please check if the AMS PTFE tube is connected.",
  "07038007":
    "Failed to extrude the filament. Please check if the extruder clogged.",
  "0703800a":
    "PTFE tube disconnection detected. Please check if the PTFE tube from AMS D to the extruder is properly connected.",
  "07038010":
    "The AMS assist motor is overloaded. This could be due to entangled filament or a stuck spool.",
  "07038011":
    "AMS filament ran out. Please insert a new filament into the same AMS slot.",
  "07038012":
    'Failed to get AMS mapping table; please select "Resume" to retry.',
  "07038013":
    "Timeout purging old filament: Please check if the filament is stuck or the extruder is clogged.",
  "07038016":
    "The extruder is not extruding normally; please refer to the Assistant. After trouble shooting. If the defects are acceptable, please resume.",
  "07038017":
    "AMS D is drying. Please stop drying process before loading/unloading material.",
  "07038018":
    "Failed to get filament-hotend mapping table from the slicing file, please retry.",
  "07038021": "AMS setup failed; please refer to the assistant.",
  "07038023":
    "AMS D cooling failed. The ambient temperature may be too high. Please operate the device in a suitable environment.",
  "07038026": "AMS set up failed. Please check the assistant for details.",
  "07038027":
    "Filament track channel switching failed. Possible causes include filament jamming or component damage.",
  "07038028":
    "Failed to feed filament to the extruder. Possible causes include an incorrect AMS–filament track switch binding, tangled filament, a stuck spool, or a disconnected PTFE tube. Please check the assistant for details.",
  "07038029":
    "This print requires a Filament Track Switch, but it is currently offline. Please connect the Filament Track Switch and retry.",
  "0703802a":
    "The Filament Track Switch was detected while the printer was not idle. Please unplug the Filament Track Switch and reconnect it after the printer enters the idle state.",
  "07038030": "Hotend pre-swap check failed.",
  "07038033": "Failed to nest hotend into slot 4 on the rack.",
  "07038034": "Failed to fetch induction hotend from slot 4 on the rack.",
  "07038037":
    "Hotend type mismatch detected during printing. Please replace the hotend in slot 4 on the rack with the type specified in the slicer before continuing the print.",
  "0703c008":
    "AMS used for the current print is disconnected. Check the connection. Printing will resume automatically after reconnection.",
  "0703c069":
    "An error occurred during AMS D drying. Please go to Assistant for more details.",
  "0703c06a":
    "AMS D is reading RFID. Unable to start drying. Please try again later.",
  "0703c06b":
    "AMS D is changing filament. Unable to start drying. Please try again later.",
  "0703c06c":
    "AMS D is in Feed Assist Mode. Unable to start drying. Please try again later.",
  "0703c06d":
    "AMS D is assisting in filament insertion. Unable to start drying. Please try again later.",
  "0703c06e":
    "AMS D motor is performing self-test. Unable to start drying. Please try again later.",
  "07044025": "Failed to read the filament information.",
  "07048003":
    "Failed to pull out the filament from the extruder. This might be caused by clogged extruder or filament broken inside the extruder.",
  "07048004":
    "AMS failed to pull back filament. This could be due to a stuck spool or the end of the filament being stuck in the path.",
  "07048005":
    "The AMS failed to send out filament. You can clip the end of your filament flat, and reinsert. If this message persists, please check the PTFE tubes in AMS for any signs of wear and tear.",
  "07048006":
    "Unable to feed filament into the extruder. This could be due to an entangled filament or a stuck spool. If not, please check if the AMS PTFE tube is connected.",
  "07048007":
    "Failed to extrude the filament. Please check if the extruder clogged.",
  "0704800a":
    "PTFE tube disconnection detected. Please check if the PTFE tube from AMS E to the extruder is properly connected.",
  "07048010":
    "The AMS assist motor is overloaded. This could be due to entangled filament or a stuck spool.",
  "07048011":
    "AMS filament ran out. Please insert a new filament into the same AMS slot.",
  "07048012":
    'Failed to get AMS mapping table; please select "Resume" to retry.',
  "07048013":
    "Timeout purging old filament: Please check if the filament is stuck or the extruder is clogged.",
  "07048016":
    "The extruder is not extruding normally; please refer to the Assistant. After trouble shooting. If the defects are acceptable, please resume.",
  "07048018":
    "Failed to get filament-hotend mapping table from the slicing file, please retry.",
  "07048021": "AMS setup failed; please refer to the assistant.",
  "07048023":
    "AMS E cooling failed. The ambient temperature may be too high. Please operate the device in a suitable environment.",
  "07048030": "Hotend pre-swap check failed.",
  "07048033": "Failed to nest hotend into slot 5 on the rack.",
  "07048034": "Failed to fetch induction hotend from slot 5 on the rack.",
  "07048037":
    "Hotend type mismatch detected during printing. Please replace the hotend in slot 5 on the rack with the type specified in the slicer before continuing the print.",
  "0704c008":
    "AMS used for the current print is disconnected. Check the connection. Printing will resume automatically after reconnection.",
  "07054025": "Failed to read the filament information.",
  "07058003":
    "Failed to pull out the filament from the extruder. This might be caused by clogged extruder or filament broken inside the extruder.",
  "07058004":
    "AMS failed to pull back filament. This could be due to a stuck spool or the end of the filament being stuck in the path.",
  "07058005":
    "The AMS failed to send out filament. You can clip the end of your filament flat, and reinsert. If this message persists, please check the PTFE tubes in AMS for any signs of wear and tear.",
  "07058006":
    "Unable to feed filament into the extruder. This could be due to an entangled filament or a stuck spool. If not, please check if the AMS PTFE tube is connected.",
  "07058007":
    "Failed to extrude the filament. Please check if the extruder clogged.",
  "0705800a":
    "PTFE tube disconnection detected. Please check if the PTFE tube from AMS F to the extruder is properly connected.",
  "07058010":
    "The AMS assist motor is overloaded. This could be due to entangled filament or a stuck spool.",
  "07058011":
    "AMS filament ran out. Please insert a new filament into the same AMS slot.",
  "07058012":
    'Failed to get AMS mapping table; please select "Resume" to retry.',
  "07058013":
    "Timeout purging old filament: Please check if the filament is stuck or the extruder is clogged.",
  "07058016":
    "The extruder is not extruding normally; please refer to the Assistant. After trouble shooting. If the defects are acceptable, please resume.",
  "07058018":
    "Failed to get filament-hotend mapping table from the slicing file, please retry.",
  "07058021": "AMS setup failed; please refer to the assistant.",
  "07058023":
    "AMS F cooling failed. The ambient temperature may be too high. Please operate the device in a suitable environment.",
  "07058030": "Hotend pre-swap check failed.",
  "07058033": "Failed to nest hotend into slot 6 on the rack.",
  "07058034": "Failed to fetch induction hotend from slot 6 on the rack.",
  "07058037":
    "Hotend type mismatch detected during printing. Please replace the hotend in slot 6 on the rack with the type specified in the slicer before continuing the print.",
  "0705c008":
    "AMS used for the current print is disconnected. Check the connection. Printing will resume automatically after reconnection.",
  "07064025": "Failed to read the filament information.",
  "07068003":
    "Failed to pull out the filament from the extruder. This might be caused by clogged extruder or filament broken inside the extruder.",
  "07068004":
    "AMS failed to pull back filament. This could be due to a stuck spool or the end of the filament being stuck in the path.",
  "07068005":
    "The AMS failed to send out filament. You can clip the end of your filament flat, and reinsert. If this message persists, please check the PTFE tubes in AMS for any signs of wear and tear.",
  "07068006":
    "Unable to feed filament into the extruder. This could be due to an entangled filament or a stuck spool. If not, please check if the AMS PTFE tube is connected.",
  "07068007":
    "Failed to extrude the filament. Please check if the extruder clogged.",
  "0706800a":
    "PTFE tube disconnection detected. Please check if the PTFE tube from AMS G to the extruder is properly connected.",
  "07068010":
    "The AMS assist motor is overloaded. This could be due to entangled filament or a stuck spool.",
  "07068011":
    "AMS filament ran out. Please insert a new filament into the same AMS slot.",
  "07068012":
    'Failed to get AMS mapping table; please select "Resume" to retry.',
  "07068013":
    "Timeout purging old filament: Please check if the filament is stuck or the extruder is clogged.",
  "07068016":
    "The extruder is not extruding normally; please refer to the Assistant. After trouble shooting. If the defects are acceptable, please resume.",
  "07068018":
    "Failed to get filament-hotend mapping table from the slicing file, please retry.",
  "07068021": "AMS setup failed; please refer to the assistant.",
  "07068023":
    "AMS G cooling failed. The ambient temperature may be too high. Please operate the device in a suitable environment.",
  "07068030": "Hotend pre-swap check failed.",
  "0706c008":
    "AMS used for the current print is disconnected. Check the connection. Printing will resume automatically after reconnection.",
  "07074025": "Failed to read the filament information.",
  "07078003":
    "Failed to pull out the filament from the extruder. This might be caused by clogged extruder or filament broken inside the extruder.",
  "07078004":
    "AMS failed to pull back filament. This could be due to a stuck spool or the end of the filament being stuck in the path.",
  "07078005":
    "The AMS failed to send out filament. You can clip the end of your filament flat, and reinsert. If this message persists, please check the PTFE tubes in AMS for any signs of wear and tear.",
  "07078006":
    "Unable to feed filament into the extruder. This could be due to an entangled filament or a stuck spool. If not, please check if the AMS PTFE tube is connected.",
  "07078007":
    "Failed to extrude the filament. Please check if the extruder clogged.",
  "0707800a":
    "PTFE tube disconnection detected. Please check if the PTFE tube from AMS H to the extruder is properly connected.",
  "07078010":
    "The AMS assist motor is overloaded. This could be due to entangled filament or a stuck spool.",
  "07078011":
    "AMS filament ran out. Please insert a new filament into the same AMS slot.",
  "07078012":
    'Failed to get AMS mapping table; please select "Resume" to retry.',
  "07078013":
    "Timeout purging old filament: Please check if the filament is stuck or the extruder is clogged.",
  "07078016":
    "The extruder is not extruding normally; please refer to the Assistant. After trouble shooting. If the defects are acceptable, please resume.",
  "07078018":
    "Failed to get filament-hotend mapping table from the slicing file, please retry.",
  "07078021": "AMS setup failed; please refer to the assistant.",
  "07078023":
    "AMS H cooling failed. The ambient temperature may be too high. Please operate the device in a suitable environment.",
  "07078030": "Hotend pre-swap check failed.",
  "0707c008":
    "AMS used for the current print is disconnected. Check the connection. Printing will resume automatically after reconnection.",
  "07fe8001":
    "Failed to cut the filament of the left extruder. Please check the cutter.",
  "07fe8002":
    "The cutter of the left extruder is stuck. Please pull out the cutter handle.",
  "07fe8003":
    "Please pull out the filament on the spool holder  of the left extruder. If this message persists, please check to see if there is filament broken in the extruder. (Connect a PTFE tube if you are about to use an AMS.)",
  "07fe8004":
    "Failed to pull back the filament from the left extruder. Please check whether the filament is stuck inside the extruder.",
  "07fe8005":
    "Failed to feed the filament outside the AMS. Please clip the end of the filament flat and check to see if the spool is stuck.",
  "07fe8006":
    "Please feed filament into the PTFE tube of the left extruder until it can not be pushed any farther.",
  "07fe8007":
    'Please observe the nozzle of the left extruder. If the filament has been extruded, select "Continue"; if it is not, please push the filament forward slightly, and then select "Retry".',
  "07fe8010": "Check if the left external filament spool or filament is stuck.",
  "07fe8011":
    "The external filament connected to the left extruder has run out; please load a new filament.",
  "07fe8012": 'Failed to get mapping table; please select "Resume" to retry.',
  "07fe8013":
    "Timeout purging old filament of the left extruder: Please check if the filament is stuck or the extruder is clogged.",
  "07fe8018":
    "Failed to get filament-hotend mapping table from the slicing file, please retry.",
  "07fe8020": "Extruder change failed; please refer to the assistant.",
  "07fe8021": "AMS setup failed; please refer to the assistant.",
  "07fe8024":
    "Extruder position calibration failed; please refer to the assistant.",
  "07fe8025":
    "Cold pulling timed out. Please promptly operate or check whether the filament is broken inside the extruder, and click the Assistant for details.",
  "07fe8030":
    "The filament specified in the slicer has been used up. Printing is paused. Please go to the machine to replace the material and resume printing.",
  "07fec003":
    "Please pull out the filament on the spool holder of the left extruder. If this message persists, please check to see if there is filament broken in the extruder or PTFE tube. (Connect a PTFE tube if you are about to use an AMS)",
  "07fec006":
    "Please feed filament into the PTFE tube of the left extruder until it can not be pushed any farther.",
  "07fec008":
    "Please pull out the filament on the spool holder of the left extruder. If this message persists, please check to see if there is filament broken in the extruder or PTFE tube. (Connect a PTFE tube if you are about to use an AMS)",
  "07fec009":
    "Please feed filament into the PTFE tube of the left extruder until it can not be pushed any farther.",
  "07fec00a":
    'Please observe the nozzle of the left extruder. If the filament has been extruded, select "Continue"; if not, please push the filament forward slightly and then select "Retry".',
  "07fec010":
    "Insert the filament until it can not be pushed any farther. There might be slight smoke during purging, so please close the front door and top cover after insertion.",
  "07fec011":
    "Please manually and slowly pull out the filament from the extruder. Then click “Continue”.",
  "07fec012":
    'Press the black PTFE tube coupler and unplug the PTFE tube. After completing the operation, click "Continue."',
  "07fec030":
    "The filament specified in the slicer has been used up. Printing is paused. Please go to the machine to replace the material and resume printing.",
  "07ff4001":
    "Filament is still loaded from the AMS after it has been disabled. Please unload the filament, load from the spool holder, and restart printing.",
  "07ff8001": "Failed to cut the filament. Please check the cutter.",
  "07ff8002": "The cutter is stuck. Please make sure the cutter handle is out.",
  "07ff8003":
    "Please pull out the filament on the spool holder. If this message persists, please check to see if there is filament broken in the extruder. (Connect a PTFE tube if you are about to use an AMS.)",
  "07ff8004":
    "Failed to pull back the filament from the toolhead to AMS. Please check whether the filament or the spool is stuck.",
  "07ff8005":
    "Failed to feed the filament outside the AMS. Please clip the end of the filament flat and check to see if the spool is stuck.",
  "07ff8006":
    "Please feed filament into the PTFE tube until it can not be pushed any farther.",
  "07ff8007":
    'Please observe the nozzle. If the filament has been extruded, select "Continue"; if it is not, please push the filament forward slightly, and then select "Retry".',
  "07ff800d":
    "Failed to feed material from the right extruder to the toolhead. Please refer to the assistant for troubleshooting. Remove the filament, resolve any abnormalities, and then continue.",
  "07ff8010": "Check if the external filament spool or filament is stuck.",
  "07ff8011": "External filament has run out; please load a new filament.",
  "07ff8012":
    'Failed to get AMS mapping table; please select "Resume" to retry.',
  "07ff8013":
    "Timeout purging old filament of the right extruder: Please check if the filament is stuck or the extruder is clogged.",
  "07ff8017":
    "Filament remains were detected in the PTFE tube between the Auxiliary Extruder and the Toolhead. Please follow the assistant to remove the filament, then click “Continue.”",
  "07ff8018":
    "Failed to get filament-hotend mapping table from the slicing file, please retry.",
  "07ff8020": "Extruder change failed; please refer to the assistant.",
  "07ff8021": "AMS setup failed; please refer to the assistant.",
  "07ff8024":
    "Extruder position calibration failed; please refer to the assistant.",
  "07ff8025":
    "Cold pull timed out. Please promptly operate or check whether the filament is broken inside the extruder, and click the Assistant for details.",
  "07ff8030":
    "The filament specified in the slicer has been used up. Printing is paused. Please go to the machine to replace the material and resume printing.",
  "07ffc003":
    "Please pull out the filament on the spool holder. If this message persists, please check to see if there is filament broken in the extruder or PTFE tube. (Connect a PTFE tube if you are about to use an AMS)",
  "07ffc006":
    "Please feed filament into the PTFE tube until it can not be pushed any farther.",
  "07ffc008":
    "Please pull out the filament on the spool holder. If this message persists, please check to see if there is filament broken in the extruder. (Connect a PTFE tube if you are about to use an AMS)",
  "07ffc009":
    "Please feed filament into the PTFE tube until it can not be pushed any farther.",
  "07ffc00a":
    'Please observe the nozzle. If the filament has been extruded, select "Continue"; if not, please push the filament forward slightly and then select "Retry".',
  "07ffc010":
    "Insert the filament (over 30cm long) until it stops. You might see slight smoke during flushing. After insertion, close the front door and top cover.",
  "07ffc011":
    "Hold the driven wheel bracket, slowly pull the filament from the extruder, then press 'Continue'.",
  "07ffc012":
    'Press the black PTFE tube coupler and unplug the PTFE tube. After completing the operation, click "Continue."',
  "07ffc030":
    "The filament specified in the slicer has been used up. Printing is paused. Please go to the machine to replace the material and resume printing.",
  "0c004020":
    "The setup of BirdsEye Camera failed. Please clear all objects and remove the mat. Make sure the marker is not obstructed. Meanwhile, clean both the BirdsEye Camera and Toolhead Camera, and remove any foreign objects blocking their view.",
  "0c004021": "The setup of BirdsEye Camera failed; please reboot the printer.",
  "0c004022":
    "The setup of BirdsEye Camera failed.  Please check if the laser module is working properly.",
  "0c004024":
    "The Birdseye Camera is installed offset. Please refer to the assistant to reinstall it.",
  "0c004025":
    "The Birdseye Camera is dirty. Please clean it and restart the process.",
  "0c004026":
    "The Live View Camera initialization failed; please reboot the printer.",
  "0c004027":
    "The Live View Camera calibration failed. Please refer to the assistant for details and recalibrate the camera after processing.",
  "0c004029": "Material not detected. Please confirm placement and continue.",
  "0c00402a":
    "The visual marker was not detected. Please re-paste the paper in the correct position.",
  "0c00402c": "Device data link error. Please reboot the printer.",
  "0c00402d":
    "The toolhead camera is not working properly; please reboot the device.",
  "0c00403d":
    "The vision encoder plate was not detected. Please confirm it is correctly positioned on the heatbed.",
  "0c00403e":
    "The high-precision nozzle offset calibration has failed, possibly due to a damaged pattern or the similarity of the colors of the two selected filaments. Please clear the printed pattern and replace the filaments with higher color contrast before re-calibrating.",
  "0c004041":
    "Toolhead camera calibration failed. Please ensure the Calibration Marker on the heatbed or Height Calibration Marker on the homing area is clean and undamaged, then re-run the calibration process.",
  "0c008002": "",
  "0c008005":
    "Purged filament has piled up in the waste chute, which may cause a tool head collision.",
  "0c008009": "Build plate localization marker was not found.",
  "0c00800b":
    "The heatbed marker was not detected. Please clear all objects and remove the mat. Make sure the marker is not obstructed.",
  "0c008015":
    "Objects detected on the platform; please clean them up in a timely manner.",
  "0c008016":
    "The foreign object detection function is not working. You can continue the task or check assistant for solutions.",
  "0c008017":
    "Foreign objects detected on the platform; please clean them up on time.",
  "0c008018":
    "The foreign object detection function is not working. You can continue the task or view the assistant for troubleshooting.",
  "0c008033":
    "Quick-release Lever is not locked. Please push it down to secure.",
  "0c008034":
    "Liveview Camera initialization failed. This print can still continue, but some AI functions will be disabled. If you encounter this issue again after restarting, please contact customer support.",
  "0c00803f":
    "AI detected nozzle clumping. Please check the nozzle condition. Refer to assistant for solutions.",
  "0c008040":
    "AI detected air-printing defect. Please check the hotend extrusion status. Refer to assistant for solutions.",
  "0c008042":
    "The AI print monitor has detected a spaghetti defect. Please check the print and take the necessary action.",
  "0c008043":
    "AI detected nozzle clumping. Please check the nozzle condition. Refer to assistant for solutions.",
  "0c00c004": "Possible spaghetti failure was detected.",
  "0c00c006": "Purged filament may have piled up in the waste chute.",
  "1000c001":
    "High bed temperature may lead to filament clogging in the nozzle. You may open the chamber door.",
  "1000c002":
    "Printing CF material with stainless steel may cause nozzle damage.",
  "1000c003":
    "Enabling Timelapse in traditional mode may cause defects; please activate this feature as needed.",
  "10014001":
    "Timelapse is not supported as Spiral Vase mode is enabled in slicing presets.",
  "10014002":
    'Timelapse is not supported as the Print sequence is set to "By object".',
  "10018003":
    "The time-lapse mode is set to Traditional in the slicing file. This may cause surface defects. Would you like to enable it?",
  "10018004":
    "Prime Tower is not enabled and time-lapse mode is set to Smooth in slicing file. This may cause surface defects. Would you like to enable it?",
  "12004001":
    "Filament is still loaded from the AMS when it has been disabled. Please unload AMS filament, load from spool holder, and restart print job.",
  "12008001":
    "Cutting the filament failed. Please check to see if the cutter is stuck. Refer to the Assistant for solutions.",
  "12008002": "The cutter is stuck. Please pull out the cutter handle.",
  "12008003":
    "Failed to pull out the filament from the extruder. Please check whether the extruder is clogged or whether the filament is broken inside the extruder.",
  "12008004":
    "Failed to pull back the filament from the toolhead. Please check whether the filament is stuck.",
  "12008005": "The filament is not inserted. Please insert the filament.",
  "12008006":
    "Unable to feed filament into the extruder. This could be due to tangled filament or a stuck spool. If not, please check if the AMS PTFE tube is connected.",
  "12008007":
    "Failed to extrude the filament. This might be caused by clogged extruder or stuck filament. Refer to the Assistant for solutions.",
  "12008010": "Filament or spool may be stuck.",
  "12008011":
    "AMS filament has run out. Please insert a new filament into the same AMS slot.",
  "12008012":
    'Failed to get AMS mapping table; please select "Resume" to retry.',
  "12008013":
    "Timeout while purging old filament. Please check if the filament is stuck or the extruder clogged.",
  "12008014":
    "The filament location in the toolhead was not found. Refer to the Assistant for solutions.",
  "12008015":
    "Failed to pull out the filament from the toolhead. Please check if the filament is stuck, or if it is broken inside the extruder or PTFE tube.",
  "12008016":
    "The extruder is not extruding normally. Refer to the Assistant for troubleshooting. There may be defects in this layer, but you may resume if the defects are acceptable.",
  "12014001":
    "Filament is still loaded from the AMS when it has been disabled. Please unload AMS filament, load from spool holder, and restart print job.",
  "12018001": "Failed to cut the filament. Please check the cutter.",
  "12018002": "The cutter is stuck. Please pull out the cutter handle.",
  "12018003":
    "Failed to pull out the filament from the extruder. Please check whether the extruder is clogged or whether the filament is broken inside the extruder.",
  "12018004":
    "Failed to pull back the filament from the toolhead. Please check whether the filament is stuck.",
  "12018005":
    'Failed to feed the filament. Please load the filament and then select "Retry".',
  "12018006":
    "Failed to feed the filament into the toolhead. Please check whether the filament is stuck.",
  "12018007":
    "Failed to extrude the filament. The extruder may be clogged or the filament may be stuck; please refer to HMS.",
  "12018010": "Please check if the spool or filament is stuck.",
  "12018011":
    "AMS filament has run out. Please insert a new filament into the same AMS slot.",
  "12018012":
    'Failed to get AMS mapping table; please select "Resume" to retry.',
  "12018013":
    "Timeout while purging old filament. Please check if the filament is stuck or the extruder clogged.",
  "12018014":
    "Failed to check the filament location in the tool head, please refer to the HMS.",
  "12018015":
    "Failed to pull back the filament from the toolhead. Please check if the filament is stuck or the filament is broken inside the extruder.",
  "12018016":
    "The extruder is not extruding normally, please refer to the HMS. After trouble shooting, if the defects are acceptable, please resume printing.",
  "12024001":
    "Filament is still loaded from the AMS when it has been disabled. Please unload AMS filament, load from spool holder, and restart print job.",
  "12028001": "Failed to cut the filament. Please check the cutter.",
  "12028002": "The cutter is stuck. Please pull out the cutter handle.",
  "12028003":
    "Failed to pull out the filament from the extruder. Please check whether the extruder is clogged or whether the filament is broken inside the extruder.",
  "12028004":
    "Failed to pull back the filament from the toolhead. Please check whether the filament is stuck.",
  "12028005": "The filament is not inserted. Please insert the filament.",
  "12028006":
    "Failed to feed the filament into the toolhead. Please check whether the filament is stuck.",
  "12028007":
    "Failed to extrude the filament. The extruder may be clogged or the filament may be stuck; please refer to HMS.",
  "12028010": "Please check if the spool or filament is stuck.",
  "12028011":
    "AMS filament has run out. Please insert a new filament into the same AMS slot.",
  "12028012":
    'Failed to get AMS mapping table; please select "Resume" to retry.',
  "12028013":
    "Timeout while purging old filament. Please check if the filament is stuck or the extruder clogged.",
  "12028014":
    "Failed to check the filament location in the tool head, please refer to the HMS.",
  "12028015":
    "Failed to pull back the filament from the toolhead. Please check if the filament is stuck or is broken inside the extruder.",
  "12028016":
    "The extruder is not extruding normally, please refer to the HMS. After trouble shooting, if the defects are acceptable, please resume printing.",
  "12034001":
    "Filament is still loaded from the AMS when it has been disabled. Please unload AMS filament, load from spool holder, and restart print job.",
  "12038001": "Failed to cut the filament. Please check the cutter.",
  "12038002": "The cutter is stuck. Please pull out the cutter handle.",
  "12038003":
    "Failed to pull out the filament from the extruder. Please check whether the extruder is clogged or whether the filament is broken inside the extruder.",
  "12038004":
    "Failed to pull back the filament from the toolhead. Please check whether the filament is stuck.",
  "12038005": "The filament is not inserted. Please insert the filament.",
  "12038006":
    "Failed to feed the filament into the toolhead. Please check whether the filament is stuck.",
  "12038007":
    "Failed to extrude the filament. The extruder may be clogged or the filament may be stuck; please refer to HMS.",
  "12038010": "Please check if the spool or filament is stuck.",
  "12038011":
    "AMS filament has run out. Please insert a new filament into the same AMS slot.",
  "12038012":
    'Failed to get AMS mapping table; please select "Resume" to retry.',
  "12038013":
    "Timeout while purging old filament. Please check if the filament is stuck or the extruder clogged.",
  "12038014":
    "Failed to check the filament location in the tool head; please refer to the HMS.",
  "12038015":
    "Failed to pull back the filament from the toolhead. Please check if the filament is stuck or is broken inside the extruder.",
  "12038016":
    "The extruder is not extruding normally, please refer to the HMS. After trouble shooting, if the defects are acceptable, please resume printing.",
  "12ff4001":
    "Filament is still loaded from the AMS when it has been disabled. Please unload AMS filament, load from spool holder, and restart print job.",
  "12ff8001": "Failed to cut the filament. Please check the cutter.",
  "12ff8002": "The cutter is stuck. Please pull out the cutter handle.",
  "12ff8003":
    "Please pull out the filament on the spool holder. If this message persists, please check to see if there is filament broken in the extruder or PTFE tube. (Connect a PTFE tube if you are about to use an AMS)",
  "12ff8004":
    "Failed to pull back the filament from the toolhead. Please check whether the filament is stuck.",
  "12ff8005": "The filament is not inserted. Please insert the filament.",
  "12ff8006":
    "Please feed filament into the PTFE tube until it can not be pushed any farther.",
  "12ff8007":
    'Check nozzle. Select "Done" if filament was extruded, otherwise push filament forward slightly and select "Retry."',
  "12ff8010": "Please check if the filament or the spool is stuck.",
  "12ff8011":
    "AMS filament has run out. Please insert a new filament into the same AMS slot.",
  "12ff8012":
    'Failed to get AMS mapping table; please select "Resume" to retry.',
  "12ff8013":
    "Timeout while purging old filament. Please check if the filament is stuck or the extruder clogged.",
  "12ffc003":
    "Please pull out the filament on the spool holder. If this message persists, please check to see if there is filament broken in the extruder or PTFE Tube. (Connect a PTFE tube if you are about to use an AMS.)",
  "12ffc006":
    "Please feed filament into the PTFE tube until it can not be pushed any farther.",
  "18004025": "Failed to read the filament information.",
  "18008003":
    "Failed to pull out the filament from the extruder. This might be caused by clogged extruder or filament broken inside the extruder.",
  "18008004":
    "AMS-HT failed to pull back filament. This could be due to a stuck spool or the end of the filament being stuck in the path.",
  "18008005":
    "The AMS-HT failed to send out filament. You can clip the end of your filament flat, and reinsert. If this message persists, please check the PTFE tubes in AMS for any signs of wear and tear.",
  "18008006":
    "Unable to feed filament into the extruder. This could be due to an entangled filament or a stuck spool. If not, please check if the AMS-HT PTFE tube is connected.",
  "18008007":
    "Failed to extrude the filament. Please check if the extruder clogged.",
  "1800800a":
    "PTFE tube disconnection detected. Please check if the PTFE tube from AMS-HT A to the extruder is properly connected.",
  "18008010":
    "The AMS-HT assist motor is overloaded. This could be due to entangled filament or a stuck spool.",
  "18008011":
    "AMS-HT filament ran out. Please insert a new filament into the same AMS-HT slot.",
  "18008012":
    'Failed to get AMS mapping table; please select "Resume" to retry.',
  "18008013":
    "Timeout purging old filament: Please check if the filament is stuck or the extruder is clogged.",
  "18008016":
    "The extruder is not extruding normally; please refer to the Assistant. After trouble shooting. If the defects are acceptable, please resume.",
  "18008017":
    "AMS-HT A is drying. Please stop drying process before loading/unloading material.",
  "18008018":
    "Failed to get filament-hotend mapping table from the slicing file, please retry.",
  "18008021": "AMS setup failed; please refer to the assistant.",
  "18008023":
    "AMS-HT A cooling failed. The ambient temperature may be too high. Please operate the device in a suitable environment.",
  "18008026": "AMS set up failed. Please check the assistant for details.",
  "18008027":
    "Filament track channel switching failed. Possible causes include filament jamming or component damage.",
  "18008028":
    "Failed to feed filament to the extruder. Possible causes include an incorrect AMS–filament track switch binding, tangled filament, a stuck spool, or a disconnected PTFE tube. Please check the assistant for details.",
  "18008029":
    "This print requires a Filament Track Switch, but it is currently offline. Please connect the Filament Track Switch and retry.",
  "1800802a":
    "The Filament Track Switch was detected while the printer was not idle. Please unplug the Filament Track Switch and reconnect it after the printer enters the idle state.",
  "18008030": "Hotend pre-swap check failed.",
  "18008031": "Failed to lock the induction hotend.",
  "18008032": "Failed to unlock the induction hotend.",
  "18008033": "Failed to nest hotend into slot 1 on the rack.",
  "18008034": "Failed to fetch induction hotend from slot 1 on the rack.",
  "18008035":
    "Hotend Rack coarse homing failed. Please check for obstructions or if the build plate is misaligned.",
  "18008036":
    "Hotend rack coarse homing failed. Please check for obstructions or if the build plate is misaligned.",
  "1800c008":
    "AMS used for the current print is disconnected. Check the connection. Printing will resume automatically after reconnection.",
  "1800c069":
    "An error occurred during AMS-HT A drying. Please go to Assistant for more details.",
  "1800c06a":
    "AMS-HT A is reading RFID. Unable to start drying. Please try again later.",
  "1800c06b":
    "AMS-HT A is changing filament. Unable to start drying. Please try again later.",
  "1800c06c":
    "AMS-HT A is in Feed Assist Mode. Unable to start drying. Please try again later.",
  "1800c06d":
    "AMS-HT A is assisting in filament insertion. Unable to start drying. Please try again later.",
  "1800c06e":
    "AMS-HT A motor is performing self-test. Unable to start drying. Please try again later.",
  "18014025": "Failed to read the filament information.",
  "18018003":
    "Failed to pull out the filament from the extruder. This might be caused by clogged extruder or filament broken inside the extruder.",
  "18018004":
    "AMS-HT failed to pull back filament. This could be due to a stuck spool or the end of the filament being stuck in the path.",
  "18018005":
    "The AMS-HT failed to send out filament. You can clip the end of your filament flat, and reinsert. If this message persists, please check the PTFE tubes in AMS for any signs of wear and tear.",
  "18018006":
    "Unable to feed filament into the extruder. This could be due to an entangled filament or a stuck spool. If not, please check if the AMS-HT PTFE tube is connected.",
  "18018007":
    "Failed to extrude the filament. Please check if the extruder clogged.",
  "1801800a":
    "PTFE tube disconnection detected. Please check if the PTFE tube from AMS-HT B to the extruder is properly connected.",
  "18018010":
    "The AMS-HT assist motor is overloaded. This could be due to entangled filament or a stuck spool.",
  "18018011":
    "AMS-HT filament ran out. Please insert a new filament into the same AMS-HT slot.",
  "18018012":
    'Failed to get AMS mapping table; please select "Resume" to retry.',
  "18018013":
    "Timeout purging old filament: Please check if the filament is stuck or the extruder is clogged.",
  "18018016":
    "The extruder is not extruding normally; please refer to the Assistant. After trouble shooting. If the defects are acceptable, please resume.",
  "18018017":
    "AMS-HT B is drying. Please stop drying process before loading/unloading material.",
  "18018018":
    "Failed to get filament-hotend mapping table from the slicing file, please retry.",
  "18018021": "AMS setup failed; please refer to the assistant.",
  "18018023":
    "AMS-HT B cooling failed. The ambient temperature may be too high. Please operate the device in a suitable environment.",
  "18018026": "AMS set up failed. Please check the assistant for details.",
  "18018027":
    "Filament track channel switching failed. Possible causes include filament jamming or component damage.",
  "18018028":
    "Failed to feed filament to the extruder. Possible causes include an incorrect AMS–filament track switch binding, tangled filament, a stuck spool, or a disconnected PTFE tube. Please check the assistant for details.",
  "18018029":
    "This print requires a Filament Track Switch, but it is currently offline. Please connect the Filament Track Switch and retry.",
  "1801802a":
    "The Filament Track Switch was detected while the printer was not idle. Please unplug the Filament Track Switch and reconnect it after the printer enters the idle state.",
  "18018030": "Hotend pre-swap check failed.",
  "18018033": "Failed to nest hotend into slot 2 on the rack.",
  "18018034": "Failed to fetch induction hotend from slot 2 on the rack.",
  "1801c008":
    "AMS used for the current print is disconnected. Check the connection. Printing will resume automatically after reconnection.",
  "1801c069":
    "An error occurred during AMS-HT B drying. Please go to Assistant for more details.",
  "1801c06a":
    "AMS-HT B is reading RFID. Unable to start drying. Please try again later.",
  "1801c06b":
    "AMS-HT B is changing filament. Unable to start drying. Please try again later.",
  "1801c06c":
    "AMS-HT B is in Feed Assist Mode. Unable to start drying. Please try again later.",
  "1801c06d":
    "AMS-HT B is assisting in filament insertion. Unable to start drying. Please try again later.",
  "1801c06e":
    "AMS-HT B motor is performing self-test. Unable to start drying. Please try again later.",
  "18024025": "Failed to read the filament information.",
  "18028003":
    "Failed to pull out the filament from the extruder. This might be caused by clogged extruder or filament broken inside the extruder.",
  "18028004":
    "AMS-HT failed to pull back filament. This could be due to a stuck spool or the end of the filament being stuck in the path.",
  "18028005":
    "The AMS-HT failed to send out filament. You can clip the end of your filament flat, and reinsert. If this message persists, please check the PTFE tubes in AMS for any signs of wear and tear.",
  "18028006":
    "Unable to feed filament into the extruder. This could be due to an entangled filament or a stuck spool. If not, please check if the AMS-HT PTFE tube is connected.",
  "18028007":
    "Failed to extrude the filament. Please check if the extruder clogged.",
  "1802800a":
    "PTFE tube disconnection detected. Please check if the PTFE tube from AMS-HT C to the extruder is properly connected.",
  "18028010":
    "The AMS-HT assist motor is overloaded. This could be due to entangled filament or a stuck spool.",
  "18028011":
    "AMS-HT filament ran out. Please insert a new filament into the same AMS-HT slot.",
  "18028012":
    'Failed to get AMS mapping table; please select "Resume" to retry.',
  "18028013":
    "Timeout purging old filament: Please check if the filament is stuck or the extruder is clogged.",
  "18028016":
    "The extruder is not extruding normally; please refer to the Assistant. After trouble shooting. If the defects are acceptable, please resume.",
  "18028017":
    "AMS-HT C is drying. Please stop drying process before loading/unloading material.",
  "18028018":
    "Failed to get filament-hotend mapping table from the slicing file, please retry.",
  "18028021": "AMS setup failed; please refer to the assistant.",
  "18028023":
    "AMS-HT C cooling failed. The ambient temperature may be too high. Please operate the device in a suitable environment.",
  "18028026": "AMS set up failed. Please check the assistant for details.",
  "18028027":
    "Filament track channel switching failed. Possible causes include filament jamming or component damage.",
  "18028028":
    "Failed to feed filament to the extruder. Possible causes include an incorrect AMS–filament track switch binding, tangled filament, a stuck spool, or a disconnected PTFE tube. Please check the assistant for details.",
  "18028029":
    "This print requires a Filament Track Switch, but it is currently offline. Please connect the Filament Track Switch and retry.",
  "1802802a":
    "The Filament Track Switch was detected while the printer was not idle. Please unplug the Filament Track Switch and reconnect it after the printer enters the idle state.",
  "18028030": "Hotend pre-swap check failed.",
  "18028033": "Failed to nest hotend into slot 3 on the rack.",
  "18028034": "Failed to fetch induction hotend from slot 3 on the rack.",
  "1802c008":
    "AMS used for the current print is disconnected. Check the connection. Printing will resume automatically after reconnection.",
  "1802c069":
    "An error occurred during AMS-HT C drying. Please go to Assistant for more details.",
  "1802c06a":
    "AMS-HT C is reading RFID. Unable to start drying. Please try again later.",
  "1802c06b":
    "AMS-HT C is changing filament. Unable to start drying. Please try again later.",
  "1802c06c":
    "AMS-HT C is in Feed Assist Mode. Unable to start drying. Please try again later.",
  "1802c06d":
    "AMS-HT C is assisting in filament insertion. Unable to start drying. Please try again later.",
  "1802c06e":
    "AMS-HT C motor is performing self-test. Unable to start drying. Please try again later.",
  "18034025": "Failed to read the filament information.",
  "18038003":
    "Failed to pull out the filament from the extruder. This might be caused by clogged extruder or filament broken inside the extruder.",
  "18038004":
    "AMS-HT failed to pull back filament. This could be due to a stuck spool or the end of the filament being stuck in the path.",
  "18038005":
    "The AMS-HT failed to send out filament. You can clip the end of your filament flat, and reinsert. If this message persists, please check the PTFE tubes in AMS for any signs of wear and tear.",
  "18038006":
    "Unable to feed filament into the extruder. This could be due to an entangled filament or a stuck spool. If not, please check if the AMS-HT PTFE tube is connected.",
  "18038007":
    "Failed to extrude the filament. Please check if the extruder clogged.",
  "1803800a":
    "PTFE tube disconnection detected. Please check if the PTFE tube from AMS-HT D to the extruder is properly connected.",
  "18038010":
    "The AMS-HT assist motor is overloaded. This could be due to entangled filament or a stuck spool.",
  "18038011":
    "AMS-HT filament ran out. Please insert a new filament into the same AMS-HT slot.",
  "18038012":
    'Failed to get AMS mapping table; please select "Resume" to retry.',
  "18038013":
    "Timeout purging old filament: Please check if the filament is stuck or the extruder is clogged.",
  "18038016":
    "The extruder is not extruding normally; please refer to the Assistant. After trouble shooting. If the defects are acceptable, please resume.",
  "18038017":
    "AMS-HT D is drying. Please stop drying process before loading/unloading material.",
  "18038018":
    "Failed to get filament-hotend mapping table from the slicing file, please retry.",
  "18038021": "AMS setup failed; please refer to the assistant.",
  "18038023":
    "AMS-HT D cooling failed. The ambient temperature may be too high. Please operate the device in a suitable environment.",
  "18038026": "AMS set up failed. Please check the assistant for details.",
  "18038027":
    "Filament track channel switching failed. Possible causes include filament jamming or component damage.",
  "18038028":
    "Failed to feed filament to the extruder. Possible causes include an incorrect AMS–filament track switch binding, tangled filament, a stuck spool, or a disconnected PTFE tube. Please check the assistant for details.",
  "18038029":
    "This print requires a Filament Track Switch, but it is currently offline. Please connect the Filament Track Switch and retry.",
  "1803802a":
    "The Filament Track Switch was detected while the printer was not idle. Please unplug the Filament Track Switch and reconnect it after the printer enters the idle state.",
  "18038030": "Hotend pre-swap check failed.",
  "18038033": "Failed to nest hotend into slot 4 on the rack.",
  "18038034": "Failed to fetch induction hotend from slot 4 on the rack.",
  "1803c008":
    "AMS used for the current print is disconnected. Check the connection. Printing will resume automatically after reconnection.",
  "1803c069":
    "An error occurred during AMS-HT D drying. Please go to Assistant for more details.",
  "1803c06a":
    "AMS-HT D is reading RFID. Unable to start drying. Please try again later.",
  "1803c06b":
    "AMS-HT D is changing filament. Unable to start drying. Please try again later.",
  "1803c06c":
    "AMS-HT D is in Feed Assist Mode. Unable to start drying. Please try again later.",
  "1803c06d":
    "AMS-HT D is assisting in filament insertion. Unable to start drying. Please try again later.",
  "1803c06e":
    "AMS-HT D motor is performing self-test. Unable to start drying. Please try again later.",
  "18044025": "Failed to read the filament information.",
  "18048003":
    "Failed to pull out the filament from the extruder. This might be caused by clogged extruder or filament broken inside the extruder.",
  "18048004":
    "AMS-HT failed to pull back filament. This could be due to a stuck spool or the end of the filament being stuck in the path.",
  "18048005":
    "The AMS-HT failed to send out filament. You can clip the end of your filament flat, and reinsert. If this message persists, please check the PTFE tubes in AMS for any signs of wear and tear.",
  "18048006":
    "Unable to feed filament into the extruder. This could be due to an entangled filament or a stuck spool. If not, please check if the AMS-HT PTFE tube is connected.",
  "18048007":
    "Failed to extrude the filament. Please check if the extruder clogged.",
  "1804800a":
    "PTFE tube disconnection detected. Please check if the PTFE tube from AMS-HT E to the extruder is properly connected.",
  "18048010":
    "The AMS-HT assist motor is overloaded. This could be due to entangled filament or a stuck spool.",
  "18048011":
    "AMS-HT filament ran out. Please insert a new filament into the same AMS-HT slot.",
  "18048012":
    'Failed to get AMS mapping table; please select "Resume" to retry.',
  "18048013":
    "Timeout purging old filament: Please check if the filament is stuck or the extruder is clogged.",
  "18048016":
    "The extruder is not extruding normally; please refer to the Assistant. After trouble shooting. If the defects are acceptable, please resume.",
  "18048018":
    "Failed to get filament-hotend mapping table from the slicing file, please retry.",
  "18048021": "AMS setup failed; please refer to the assistant.",
  "18048023":
    "AMS-HT E cooling failed. The ambient temperature may be too high. Please operate the device in a suitable environment.",
  "18048026": "AMS set up failed. Please check the assistant for details.",
  "18048027":
    "Filament track channel switching failed. Possible causes include filament jamming or component damage.",
  "18048028":
    "Failed to feed filament to the extruder. Possible causes include an incorrect AMS–filament track switch binding, tangled filament, a stuck spool, or a disconnected PTFE tube. Please check the assistant for details.",
  "18048029":
    "This print requires a Filament Track Switch, but it is currently offline. Please connect the Filament Track Switch and retry.",
  "1804802a":
    "The Filament Track Switch was detected while the printer was not idle. Please unplug the Filament Track Switch and reconnect it after the printer enters the idle state.",
  "18048030": "Hotend pre-swap check failed.",
  "18048033": "Failed to nest hotend into slot 5 on the rack.",
  "18048034": "Failed to fetch induction hotend from slot 5 on the rack.",
  "1804c008":
    "AMS used for the current print is disconnected. Check the connection. Printing will resume automatically after reconnection.",
  "1804c069":
    "An error occurred during AMS-HT E drying. Please go to Assistant for more details.",
  "1804c06a":
    "AMS-HT E is reading RFID. Unable to start drying. Please try again later.",
  "1804c06b":
    "AMS-HT E is changing filament. Unable to start drying. Please try again later.",
  "1804c06c":
    "AMS-HT E is in Feed Assist Mode. Unable to start drying. Please try again later.",
  "1804c06d":
    "AMS-HT E is assisting in filament insertion. Unable to start drying. Please try again later.",
  "1804c06e":
    "AMS-HT E motor is performing self-test. Unable to start drying. Please try again later.",
  "18054025": "Failed to read the filament information.",
  "18058003":
    "Failed to pull out the filament from the extruder. This might be caused by clogged extruder or filament broken inside the extruder.",
  "18058004":
    "AMS-HT failed to pull back filament. This could be due to a stuck spool or the end of the filament being stuck in the path.",
  "18058005":
    "The AMS-HT failed to send out filament. You can clip the end of your filament flat, and reinsert. If this message persists, please check the PTFE tubes in AMS for any signs of wear and tear.",
  "18058006":
    "Unable to feed filament into the extruder. This could be due to an entangled filament or a stuck spool. If not, please check if the AMS-HT PTFE tube is connected.",
  "18058007":
    "Failed to extrude the filament. Please check if the extruder clogged.",
  "1805800a":
    "PTFE tube disconnection detected. Please check if the PTFE tube from AMS-HT F to the extruder is properly connected.",
  "18058010":
    "The AMS-HT assist motor is overloaded. This could be due to entangled filament or a stuck spool.",
  "18058011":
    "AMS-HT filament ran out. Please insert a new filament into the same AMS-HT slot.",
  "18058012":
    'Failed to get AMS mapping table; please select "Resume" to retry.',
  "18058013":
    "Timeout purging old filament: Please check if the filament is stuck or the extruder is clogged.",
  "18058016":
    "The extruder is not extruding normally; please refer to the Assistant. After trouble shooting. If the defects are acceptable, please resume.",
  "18058018":
    "Failed to get filament-hotend mapping table from the slicing file, please retry.",
  "18058021": "AMS setup failed; please refer to the assistant.",
  "18058023":
    "AMS-HT F cooling failed. The ambient temperature may be too high. Please operate the device in a suitable environment.",
  "18058026": "AMS set up failed. Please check the assistant for details.",
  "18058027":
    "Filament track channel switching failed. Possible causes include filament jamming or component damage.",
  "18058028":
    "Failed to feed filament to the extruder. Possible causes include an incorrect AMS–filament track switch binding, tangled filament, a stuck spool, or a disconnected PTFE tube. Please check the assistant for details.",
  "18058029":
    "This print requires a Filament Track Switch, but it is currently offline. Please connect the Filament Track Switch and retry.",
  "1805802a":
    "The Filament Track Switch was detected while the printer was not idle. Please unplug the Filament Track Switch and reconnect it after the printer enters the idle state.",
  "18058030": "Hotend pre-swap check failed.",
  "18058033": "Failed to nest hotend into slot 6 on the rack.",
  "18058034": "Failed to fetch induction hotend from slot 6 on the rack.",
  "1805c008":
    "AMS used for the current print is disconnected. Check the connection. Printing will resume automatically after reconnection.",
  "1805c069":
    "An error occurred during AMS-HT F drying. Please go to Assistant for more details.",
  "1805c06a":
    "AMS-HT F is reading RFID. Unable to start drying. Please try again later.",
  "1805c06b":
    "AMS-HT F is changing filament. Unable to start drying. Please try again later.",
  "1805c06c":
    "AMS-HT F is in Feed Assist Mode. Unable to start drying. Please try again later.",
  "1805c06d":
    "AMS-HT F is assisting in filament insertion. Unable to start drying. Please try again later.",
  "1805c06e":
    "AMS-HT F motor is performing self-test. Unable to start drying. Please try again later.",
  "18064025": "Failed to read the filament information.",
  "18068003":
    "Failed to pull out the filament from the extruder. This might be caused by clogged extruder or filament broken inside the extruder.",
  "18068004":
    "AMS-HT failed to pull back filament. This could be due to a stuck spool or the end of the filament being stuck in the path.",
  "18068005":
    "The AMS-HT failed to send out filament. You can clip the end of your filament flat, and reinsert. If this message persists, please check the PTFE tubes in AMS for any signs of wear and tear.",
  "18068006":
    "Unable to feed filament into the extruder. This could be due to an entangled filament or a stuck spool. If not, please check if the AMS-HT PTFE tube is connected.",
  "18068007":
    "Failed to extrude the filament. Please check if the extruder clogged.",
  "1806800a":
    "PTFE tube disconnection detected. Please check if the PTFE tube from AMS-HT G to the extruder is properly connected.",
  "18068010":
    "The AMS-HT assist motor is overloaded. This could be due to entangled filament or a stuck spool.",
  "18068011":
    "AMS-HT filament ran out. Please insert a new filament into the same AMS-HT slot.",
  "18068012":
    'Failed to get AMS mapping table; please select "Resume" to retry.',
  "18068013":
    "Timeout purging old filament: Please check if the filament is stuck or the extruder is clogged.",
  "18068016":
    "The extruder is not extruding normally; please refer to the Assistant. After trouble shooting. If the defects are acceptable, please resume.",
  "18068018":
    "Failed to get filament-hotend mapping table from the slicing file, please retry.",
  "18068021": "AMS setup failed; please refer to the assistant.",
  "18068023":
    "AMS-HT G cooling failed. The ambient temperature may be too high. Please operate the device in a suitable environment.",
  "18068026": "AMS set up failed. Please check the assistant for details.",
  "18068027":
    "Filament track channel switching failed. Possible causes include filament jamming or component damage.",
  "18068028":
    "Failed to feed filament to the extruder. Possible causes include an incorrect AMS–filament track switch binding, tangled filament, a stuck spool, or a disconnected PTFE tube. Please check the assistant for details.",
  "18068029":
    "This print requires a Filament Track Switch, but it is currently offline. Please connect the Filament Track Switch and retry.",
  "1806802a":
    "The Filament Track Switch was detected while the printer was not idle. Please unplug the Filament Track Switch and reconnect it after the printer enters the idle state.",
  "18068030": "Hotend pre-swap check failed.",
  "1806c008":
    "AMS used for the current print is disconnected. Check the connection. Printing will resume automatically after reconnection.",
  "1806c069":
    "An error occurred during AMS-HT G drying. Please go to Assistant for more details.",
  "1806c06a":
    "AMS-HT G is reading RFID. Unable to start drying. Please try again later.",
  "1806c06b":
    "AMS-HT G is changing filament. Unable to start drying. Please try again later.",
  "1806c06c":
    "AMS-HT G is in Feed Assist Mode. Unable to start drying. Please try again later.",
  "1806c06d":
    "AMS-HT G is assisting in filament insertion. Unable to start drying. Please try again later.",
  "1806c06e":
    "AMS-HT G motor is performing self-test. Unable to start drying. Please try again later.",
  "18074025": "Failed to read the filament information.",
  "18078003":
    "Failed to pull out the filament from the extruder. This might be caused by clogged extruder or filament broken inside the extruder.",
  "18078004":
    "AMS-HT failed to pull back filament. This could be due to a stuck spool or the end of the filament being stuck in the path.",
  "18078005":
    "The AMS-HT failed to send out filament. You can clip the end of your filament flat, and reinsert. If this message persists, please check the PTFE tubes in AMS for any signs of wear and tear.",
  "18078006":
    "Unable to feed filament into the extruder. This could be due to an entangled filament or a stuck spool. If not, please check if the AMS-HT PTFE tube is connected.",
  "18078007":
    "Failed to extrude the filament. Please check if the extruder clogged.",
  "1807800a":
    "PTFE tube disconnection detected. Please check if the PTFE tube from AMS-HT H to the extruder is properly connected.",
  "18078010":
    "The AMS-HT assist motor is overloaded. This could be due to entangled filament or a stuck spool.",
  "18078011":
    "AMS-HT filament ran out. Please insert a new filament into the same AMS-HT slot.",
  "18078012":
    'Failed to get AMS mapping table; please select "Resume" to retry.',
  "18078013":
    "Timeout purging old filament: Please check if the filament is stuck or the extruder is clogged.",
  "18078016":
    "The extruder is not extruding normally; please refer to the Assistant. After trouble shooting. If the defects are acceptable, please resume.",
  "18078018":
    "Failed to get filament-hotend mapping table from the slicing file, please retry.",
  "18078021": "AMS setup failed; please refer to the assistant.",
  "18078023":
    "AMS-HT H cooling failed. The ambient temperature may be too high. Please operate the device in a suitable environment.",
  "18078026": "AMS set up failed. Please check the assistant for details.",
  "18078027":
    "Filament track channel switching failed. Possible causes include filament jamming or component damage.",
  "18078028":
    "Failed to feed filament to the extruder. Possible causes include an incorrect AMS–filament track switch binding, tangled filament, a stuck spool, or a disconnected PTFE tube. Please check the assistant for details.",
  "18078029":
    "This print requires a Filament Track Switch, but it is currently offline. Please connect the Filament Track Switch and retry.",
  "1807802a":
    "The Filament Track Switch was detected while the printer was not idle. Please unplug the Filament Track Switch and reconnect it after the printer enters the idle state.",
  "18078030": "Hotend pre-swap check failed.",
  "1807c008":
    "AMS used for the current print is disconnected. Check the connection. Printing will resume automatically after reconnection.",
  "1807c069":
    "An error occurred during AMS-HT H drying. Please go to Assistant for more details.",
  "1807c06a":
    "AMS-HT H is reading RFID. Unable to start drying. Please try again later.",
  "1807c06b":
    "AMS-HT H is changing filament. Unable to start drying. Please try again later.",
  "1807c06c":
    "AMS-HT H is in Feed Assist Mode. Unable to start drying. Please try again later.",
  "1807c06d":
    "AMS-HT H is assisting in filament insertion. Unable to start drying. Please try again later.",
  "1807c06e":
    "AMS-HT H motor is performing self-test. Unable to start drying. Please try again later.",
  "18fe8001":
    "Failed to cut the filament of the left extruder. Please check the cutter.",
  "18fe8002":
    "The cutter of the left extruder is stuck. Please pull out the cutter handle.",
  "18fe8003":
    "Please pull out the filament on the spool holder  of the left extruder. If this message persists, please check to see if there is filament broken in the extruder. (Connect a PTFE tube if you are about to use an AMS.)",
  "18fe8004":
    "Failed to pull back the filament from the left extruder. Please check whether the filament is stuck inside the extruder.",
  "18fe8005":
    "Failed to feed the filament outside the AMS-HT. Please clip the end of the filament flat and check to see if the spool is stuck.",
  "18fe8006":
    "Please feed filament into the PTFE tube of the left extruder until it can not be pushed any farther.",
  "18fe8007":
    'Please observe the nozzle of the left extruder. If the filament has been extruded, select "Continue"; if it is not, please push the filament forward slightly, and then select "Retry".',
  "18fe8011":
    "The external filament connected to the left extruder has run out; please load a new filament.",
  "18fe8012": 'Failed to get mapping table; please select "Resume" to retry.',
  "18fe8013":
    "Timeout purging old filament of the left extruder: Please check if the filament is stuck or the extruder is clogged.",
  "18fe8018":
    "Failed to get filament-hotend mapping table from the slicing file, please retry.",
  "18fe8020": "Extruder change failed; please refer to the assistant.",
  "18fe8021": "AMS setup failed; please refer to the assistant.",
  "18fe8024":
    "Extruder position calibration failed; please refer to the assistant.",
  "18fec003":
    "Please pull out the filament on the spool holder of the left extruder. If this message persists, please check to see if there is filament broken in the extruder or PTFE tube. (Connect a PTFE tube if you are about to use an AMS)",
  "18fec006":
    "Please feed filament into the PTFE tube of the left extruder until it can not be pushed any farther.",
  "18fec008":
    "Please pull out the filament on the spool holder of the left extruder. If this message persists, please check to see if there is filament broken in the extruder or PTFE tube. (Connect a PTFE tube if you are about to use an AMS)",
  "18fec009":
    "Please feed filament into the PTFE tube of the left extruder until it can not be pushed any farther.",
  "18fec00a":
    'Please observe the nozzle of the left extruder. If the filament has been extruded, select "Continue"; if not, please push the filament forward slightly and then select "Retry".',
  "18ff8001": "Failed to cut the filament. Please check the cutter.",
  "18ff8002":
    "The cutter of the right extruder is stuck. Please pull out the cutter handle.",
  "18ff8003":
    "Please pull out the filament on the spool holder  of the right extruder. If this message persists, please check to see if there is filament broken in the extruder. (Connect a PTFE tube if you are about to use an AMS.)",
  "18ff8004":
    "Failed to pull back the filament from the right extruder. Please check whether the filament is stuck inside the extruder.",
  "18ff8005":
    "Failed to feed the filament outside the AMS-HT. Please clip the end of the filament flat and check to see if the spool is stuck.",
  "18ff8006":
    "Please feed filament into the PTFE tube of the right extruder until it can not be pushed any farther.",
  "18ff8007":
    'Please observe the nozzle of the right extruder. If the filament has been extruded, select "Continue"; if it is not, please push the filament forward slightly, and then select "Retry".',
  "18ff8011":
    "The external filament connected to the right extruder has run out; please load a new filament.",
  "18ff8012":
    'Failed to get AMS mapping table; please select "Resume" to retry.',
  "18ff8013":
    "Timeout purging old filament of the right extruder: Please check if the filament is stuck or the extruder is clogged.",
  "18ff8018":
    "Failed to get filament-hotend mapping table from the slicing file, please retry.",
  "18ff8020": "Extruder change failed; please refer to the assistant.",
  "18ff8021": "AMS setup failed; please refer to the assistant.",
  "18ff8024":
    "Extruder position calibration failed; please refer to the assistant.",
  "18ffc003":
    "Please pull out the filament on the spool holder of the right extruder. If this message persists, please check to see if there is filament broken in the extruder or PTFE tube. (Connect a PTFE tube if you are about to use an AMS)",
  "18ffc006":
    "Please feed filament into the PTFE tube of the right extruder until it can not be pushed any farther.",
  "18ffc008":
    "Please pull out the filament on the spool holder of the right extruder. If this message persists, please check to see if there is filament broken in the extruder or PTFE tube. (Connect a PTFE tube if you are about to use an AMS)",
  "18ffc009":
    "Please feed filament into the PTFE tube of the right extruder until it can not be pushed any farther.",
  "18ffc00a":
    'Please observe the nozzle of the right extruder. If the filament has been extruded, select "Continue"; if not, please push the filament forward slightly and then select "Retry".',
  "1a004001":
    "Hotend rack coarse homing failed. Printing has been canceled. Please check if any obstruction is blocking the rack movement.",
  "1a004007":
    "Induction hotend rack calibration failed, please check the Assistant.",
  "1a004008":
    "The hotend rack is fully occupied, and hotend switching cannot be performed. Please remove one hotend before proceeding.",
  "1a004009":
    "The hotend rack has not been set up. Please complete the setup before performing a hotend replacement.",
  "1a008002":
    "Induction Hotend Rack homing failed due to an obstruction. Please remove the obstacle before resuming printing.",
  "1a008003":
    "The Hotend Rack homing distance is abnormally long. Please check whether the timing belt is loose or broken.",
  "1a008004":
    "Before using Laser Mode or calibrating the Hotend Rack position, please remove all hotends from the rack.",
};

/**
 * Build the 8-char ecode key used by HMS_ERROR_MAP.
 * Format: module_id(2) + module_num(2) + msg_code(4), all lowercase hex.
 * attr encodes: (module_id << 24) | (module_num << 16) | (part_id << 8) | reserved
 * code encodes: (severity << 16) | msg_code
 */
function buildEcode(attr: number, code: number): string {
  const moduleId = (attr >>> 24) & 0xff;
  const moduleNum = (attr >>> 16) & 0xff;
  const msgCode = code & 0xffff;
  return (
    moduleId.toString(16).padStart(2, "0") +
    moduleNum.toString(16).padStart(2, "0") +
    msgCode.toString(16).padStart(4, "0")
  );
}

export interface HmsErrorInfo {
  code: string;
  description: string;
}

export function describeHmsErrors(
  errors: { code: string; attr: number }[],
): HmsErrorInfo[] {
  return errors.map((e) => {
    const codeInt = parseInt(e.code, 16);
    const ecode = buildEcode(e.attr, codeInt);
    const description = HMS_ERROR_MAP[ecode] ?? `Unknown error (${e.code})`;
    return { code: e.code, description };
  });
}

export function hmsErrorSummary(errors: { code: string }[]): string {
  if (errors.length === 0) return "";
  const count = errors.length;
  return `Printer error${count > 1 ? ` (${count})` : ""}`;
}
