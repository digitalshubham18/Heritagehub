/**
 * Hindi for the staff screens (counter, parking, shift, handover, roster, lookup, incidents, lost and found, payment collection).
 * Keyed by the English text, so the English source stays readable in the screens and a missing entry simply shows English.
 * Written for gate staff in plain spoken Hindi; have a native speaker on your team review the wording before launch.
 */
export const hiStaff: Record<string, string> = {
  // counter
  "Booking reference": "बुकिंग संदर्भ", "Cancel and refund": "रद्द करें और रिफंड दें", "Card": "कार्ड", "Cash": "नकद", "Counter sales": "काउंटर बिक्री",
  "Does the visitor need parking?": "क्या आगंतुक को पार्किंग चाहिए?", "Driver's mobile number": "चालक का मोबाइल नंबर", "Driver's name": "चालक का नाम",
  "Free tickets: nothing to collect.": "मुफ़्त टिकट: कुछ लेना नहीं है।", "From the ticket or receipt (HH-XXXX-XXXX)": "टिकट या रसीद से (HH-XXXX-XXXX)",
  "Hand the money back by": "पैसे इस तरीके से लौटाएँ:", "I checked the driver's disabled-parking badge or permit": "मैंने चालक का दिव्यांग पार्किंग बैज या परमिट जाँच लिया है",
  "Invoice": "इनवॉइस", "Loading…": "लोड हो रहा है…", "NOT YET UPLOADED": "अभी अपलोड नहीं हुआ", "New sale": "नई बिक्री", "No open slots today": "आज कोई खुला स्लॉट नहीं",
  "No sites assigned.": "कोई स्थल नहीं सौंपा गया।", "Open invoice": "इनवॉइस खोलें", "Parking": "पार्किंग", "Parking ticket": "पार्किंग टिकट", "Pre-booking code (if any)": "प्री-बुकिंग कोड (यदि हो)",
  "Print receipt": "रसीद प्रिंट करें", "Reason": "कारण", "Recent sales": "हाल की बिक्री", "Reference": "संदर्भ", "Refunded": "रिफंड किया गया", "Refunds need a connection.": "रिफंड के लिए इंटरनेट चाहिए।",
  "Site": "स्थल", "Takings by payment method": "भुगतान के तरीके के अनुसार प्राप्ति", "Tickets": "टिकट", "Time slot": "समय स्लॉट", "Today's counter takings": "आज की काउंटर प्राप्ति", "Total taken": "कुल प्राप्त",
  "Vehicle number": "वाहन नंबर", "Vehicle type": "वाहन का प्रकार", "Visit": "भ्रमण", "Walk-in sales only. Online bookings are refunded to the original payment method.": "केवल काउंटर पर हुई बिक्री। ऑनलाइन बुकिंग का रिफंड मूल भुगतान माध्यम में जाता है।",
  "Walk-ins count against the same slot capacity as online bookings": "काउंटर पर आने वालों की गिनती भी ऑनलाइन बुकिंग वाली स्लॉट क्षमता में होती है", "e.g. Visitor changed plans": "जैसे: आगंतुक ने योजना बदल दी",
  // payment collection
  "Other": "अन्य", "Approval code": "अप्रूवल कोड", "Ask the visitor to scan this QR with any UPI app and pay exactly": "आगंतुक से कहें कि किसी भी UPI ऐप से यह QR स्कैन करे और ठीक इतना भुगतान करे:",
  "Card network": "कार्ड नेटवर्क", "Card type": "कार्ड का प्रकार", "Cash received (optional)": "प्राप्त नकद (वैकल्पिक)", "Charge": "शुल्क", "Collect": "वसूल करें", "Credit": "क्रेडिट", "Debit": "डेबिट",
  "Demo payee shown. The operator has not set a UPI ID yet (Parking, then Payments), so this QR will not reach a real account.": "डेमो प्राप्तकर्ता दिखाया गया है। ऑपरेटर ने अभी UPI ID नहीं डाली है (पार्किंग, फिर भुगतान), इसलिए यह QR किसी असली खाते तक नहीं पहुँचेगा।",
  "Enter what the visitor hands over to see the change to return": "आगंतुक जो राशि दे, वह डालें; लौटाने वाला खुला पैसा दिखेगा",
  "From the visitor's success screen or your SMS. Helps reconciliation.": "आगंतुक की सफलता स्क्रीन या आपके SMS से। मिलान में मदद करता है।", "How is the visitor paying?": "आगंतुक कैसे भुगतान कर रहा है?", "Last 4 digits": "अंतिम 4 अंक",
  "Never type the full card number, expiry or CVV here. We only store the last 4 digits and the approval code.": "यहाँ पूरा कार्ड नंबर, एक्सपायरी या CVV कभी न डालें। हम केवल अंतिम 4 अंक और अप्रूवल कोड रखते हैं।",
  "Only tap Payment received after the money shows in your UPI app, soundbox or SMS. The app cannot confirm a UPI payment by itself.": "'भुगतान मिल गया' तभी दबाएँ जब पैसा आपके UPI ऐप, साउंडबॉक्स या SMS में दिख जाए। यह ऐप खुद UPI भुगतान की पुष्टि नहीं कर सकता।",
  "Open in a UPI app on this device": "इस डिवाइस के UPI ऐप में खोलें", "Paying to": "भुगतान किसे:", "Preparing QR": "QR तैयार हो रहा है", "RRN (optional)": "RRN (वैकल्पिक)", "UPI reference / UTR (optional)": "UPI संदर्भ / UTR (वैकल्पिक)",
  "in cash.": "नकद में।", "on your card terminal, then copy these details from the slip.": "अपने कार्ड टर्मिनल पर, फिर पर्ची से ये विवरण यहाँ लिखें।", "Retry": "फिर कोशिश करें", "Upload now": "अभी अपलोड करें",
  // incidents
  "Everything reported at your sites has been resolved.": "आपके स्थलों पर दर्ज सभी मामले सुलझ गए हैं।", "Incidents": "घटनाएँ", "No open incidents": "कोई खुली घटना नहीं", "Recently resolved": "हाल में सुलझाई गईं",
  "Reports raised at your sites and what managers have done about them. Raise a new one from the Today page.": "आपके स्थलों पर दर्ज रिपोर्ट और प्रबंधकों की कार्रवाई। नई रिपोर्ट 'आज' पेज से दर्ज करें।",
  // shift and cash
  "Back": "वापस", "Cash count recorded": "नकद गिनती दर्ज हुई", "Cash counted in the drawer (₹)": "दराज़ में गिना गया नकद (₹)", "Cash you should be holding": "आपके पास होना चाहिए", "Count your cash": "अपना नकद गिनें",
  "Counted": "गिना गया", "Difference": "अंतर", "Expected": "अपेक्षित", "Method": "तरीका", "No counts yet.": "अभी कोई गिनती नहीं।", "Print": "प्रिंट", "Recent cash counts": "हाल की नकद गिनती", "Record cash count": "नकद गिनती दर्ज करें",
  "Recording a count starts a new tally from now. Managers can see every count.": "गिनती दर्ज करने पर अभी से नया हिसाब शुरू होता है। प्रबंधक हर गिनती देख सकते हैं।", "Required when the count doesn't match": "गिनती मेल न खाए तो ज़रूरी",
  "Shift and cash": "शिफ्ट और नकद", "System expected": "सिस्टम के अनुसार", "Total": "कुल", "When": "कब", "Why is there a difference?": "अंतर क्यों है?", "You counted": "आपने गिना",
  // lookup and lost-and-found
  "Bookings": "बुकिंग", "Counter": "काउंटर", "Find a visitor by booking reference, name, phone number, vehicle number, parking ticket or parking reservation code.": "बुकिंग संदर्भ, नाम, फ़ोन नंबर, वाहन नंबर, पार्किंग टिकट या पार्किंग आरक्षण कोड से आगंतुक खोजें।",
  "Go to parking to check out": "चेक-आउट के लिए पार्किंग पर जाएँ", "HH-XXXX-XXXX, phone, vehicle number…": "HH-XXXX-XXXX, फ़ोन, वाहन नंबर…", "Inside:": "अंदर:", "Monthly parking passes": "मासिक पार्किंग पास", "No match": "कोई मिलान नहीं",
  "Open in scanner": "स्कैनर में खोलें", "Parking reservations": "पार्किंग आरक्षण", "Parking tickets": "पार्किंग टिकट", "Reprint": "दोबारा प्रिंट", "Search": "खोजें", "Visitor lookup": "आगंतुक खोज",
  "Log what visitors hand in and what they report missing. Likely matches are suggested, and every return records who collected it.": "आगंतुक जो सामान जमा करें और जो खोया बताएँ, उसे दर्ज करें। संभावित मिलान सुझाए जाते हैं और हर वापसी में दर्ज होता है कि किसने लिया।", "Lost and found": "खोया-पाया",
  // handover
  "Accept the handover": "हैंडओवर स्वीकार करें", "Anything unfinished: a jammed printer, a visitor coming back, a gate left closed": "जो अधूरा है: अटका प्रिंटर, लौटकर आने वाला आगंतुक, बंद छोड़ा गया गेट", "Cancel handover": "हैंडओवर रद्द करें",
  "Cash handed over:": "सौंपा गया नकद:", "Cash you counted in the drawer (₹)": "दराज़ में आपका गिना नकद (₹)", "Choose a colleague…": "सहकर्मी चुनें…",
  "Count your cash, brief the next person, and hand the drawer over. They count it again and accept.": "अपना नकद गिनें, अगले व्यक्ति को जानकारी दें और दराज़ सौंपें। वे फिर गिनकर स्वीकार करते हैं।", "Count, record and hand over": "गिनें, दर्ज करें और सौंपें",
  "Hand over to": "किसे सौंपें", "Hand over your shift": "अपनी शिफ्ट सौंपें", "Note": "टिप्पणी", "Notes for the next person": "अगले व्यक्ति के लिए टिप्पणी", "Nothing yet.": "अभी कुछ नहीं।", "Open incidents": "खुली घटनाएँ",
  "Recent handovers": "हाल के हैंडओवर", "Shift handover": "शिफ्ट हैंडओवर", "This records your cash count, so you don't need to close it separately. Open incidents, parked vehicles and the entry status are attached automatically.": "इससे आपकी नकद गिनती भी दर्ज हो जाती है, अलग से बंद करने की ज़रूरत नहीं। खुली घटनाएँ, खड़े वाहन और प्रवेश की स्थिति अपने-आप जुड़ जाती हैं।", "Waiting for": "प्रतीक्षा में:",
  // roster
  "Ask a colleague to cover": "किसी सहकर्मी से ड्यूटी बदलने को कहें", "Cancel": "रद्द करें", "Choose…": "चुनें…", "Clock in": "ड्यूटी शुरू करें", "Clock out": "ड्यूटी खत्म करें", "Clock-in opens 30 minutes before your shift.": "शिफ्ट से 30 मिनट पहले ड्यूटी शुरू की जा सकती है।",
  "Colleague": "सहकर्मी", "Colleagues asking you to cover": "जो सहकर्मी आपसे ड्यूटी बदलने को कह रहे हैं", "Cover it": "मैं कर दूँगा/दूँगी", "Decline": "मना करें", "My roster": "मेरा रोस्टर", "My shifts": "मेरी शिफ्टें", "My swap requests": "मेरे बदलाव अनुरोध",
  "No shifts rostered. Ask your manager.": "कोई शिफ्ट तय नहीं। अपने प्रबंधक से पूछें।", "Nobody is rostered today.": "आज किसी की ड्यूटी तय नहीं।", "Not on the roster for this time": "इस समय रोस्टर में नहीं", "Note (optional)": "टिप्पणी (वैकल्पिक)", "Send request": "अनुरोध भेजें",
  "Who is on today": "आज कौन ड्यूटी पर है", "You agreed. Waiting for your manager to approve it.": "आप सहमत हैं। प्रबंधक की मंज़ूरी का इंतज़ार है।", "You're not clocked in": "आपकी ड्यूटी शुरू नहीं हुई",
  "Your colleague has to agree, then your manager approves it. The shift stays yours until then.": "पहले सहकर्मी की सहमति, फिर प्रबंधक की मंज़ूरी। तब तक शिफ्ट आपकी ही रहेगी।",
  "Your shifts for the next two weeks, set by your manager. Clock in when you arrive and out when you leave.": "अगले दो हफ़्तों की आपकी शिफ्टें, प्रबंधक द्वारा तय। पहुँचने पर ड्यूटी शुरू करें और जाते समय खत्म करें।", "e.g. Family function that day": "जैसे: उस दिन पारिवारिक कार्यक्रम", "swap requested": "बदलाव का अनुरोध किया",
  // parking
  "Admission type": "प्रवेश का प्रकार", "Admit": "प्रवेश दें", "Admit a vehicle": "वाहन को प्रवेश दें", "Amount due": "देय राशि", "Avg stay": "औसत ठहराव", "Bay": "बे", "Calculating the fee…": "शुल्क निकाला जा रहा है…", "Change returned": "लौटाया गया खुला पैसा",
  "Check out": "चेक-आउट", "Collected at the gate:": "गेट पर वसूला:", "Done": "हो गया", "Driver name (optional)": "चालक का नाम (वैकल्पिक)", "Due now": "अभी देय", "Expected today": "आज अपेक्षित", "Filter by number, ticket, driver": "नंबर, टिकट, चालक से छाँटें",
  "Filter parked vehicles": "खड़े वाहन छाँटें", "Find": "खोजें", "Gate open. Receipt": "गेट खुला। रसीद", "I checked the driver's ID and the vehicle's papers (RC) match this vehicle": "मैंने चालक का पहचान-पत्र जाँचा और वाहन के कागज़ (RC) इसी वाहन से मेल खाते हैं",
  "If this vehicle was pre-booked or holds a monthly pass it is recognised automatically": "यदि वाहन प्री-बुक है या मासिक पास वाला है तो अपने-आप पहचान लिया जाएगा", "In": "अंदर", "Keep this ticket. The fee is paid at exit.": "यह टिकट संभालकर रखें। शुल्क निकलते समय देना है।",
  "Lost-ticket charge": "टिकट खोने का शुल्क", "Mobile (optional)": "मोबाइल (वैकल्पिक)", "Monthly pass": "मासिक पास", "No pre-booked vehicles are waiting.": "कोई प्री-बुक वाहन प्रतीक्षा में नहीं।", "Nothing to collect. This vehicle can leave.": "कुछ वसूलना नहीं है। यह वाहन जा सकता है।",
  "Offline. The amount is worked out from the rates saved on this device. When this uploads the server prices it at the exact exit time and a manager sees any difference.": "ऑफ़लाइन। राशि इस डिवाइस में सहेजी दरों से निकाली गई है। अपलोड होने पर सर्वर ठीक निकासी समय के हिसाब से दाम तय करेगा और प्रबंधक को कोई अंतर दिखेगा।",
  "Out": "बाहर", "Overstay": "अधिक ठहराव", "PK-… or vehicle number": "PK-… या वाहन नंबर", "Parked": "खड़े हैं", "Parking fee": "पार्किंग शुल्क", "Pre-booked": "प्री-बुक", "Prepaid credit": "अग्रिम जमा क्रेडिट", "Quick exit": "त्वरित निकास", "Reprint copy": "दोबारा प्रिंट की प्रति",
  "Reservation code": "आरक्षण कोड", "Saved offline. It uploads when the connection returns.": "ऑफ़लाइन सहेजा गया। इंटरनेट लौटने पर अपलोड होगा।", "Saved offline. The ticket number is issued when this uploads. Use the vehicle number to check out.": "ऑफ़लाइन सहेजा गया। अपलोड होने पर टिकट नंबर मिलेगा। चेक-आउट के लिए वाहन नंबर इस्तेमाल करें।",
  "Standard car bay": "सामान्य कार बे", "The amount shown is held for 5 minutes, so the visitor pays exactly what is on screen. It refreshes by itself after that.": "दिखाई गई राशि 5 मिनट तक स्थिर रहती है, ताकि आगंतुक ठीक वही दे जो स्क्रीन पर है। उसके बाद अपने-आप बदल जाती है।",
  "Ticket": "टिकट", "Ticket number or vehicle number": "टिकट नंबर या वाहन नंबर", "Time parked": "खड़े रहने का समय", "Today": "आज",
  "UPI is switched off for this site because no UPI ID has been set. Take cash or card, or ask your manager to set the UPI ID.": "इस स्थल पर UPI बंद है क्योंकि कोई UPI ID नहीं डाली गई। नकद या कार्ड लें, या प्रबंधक से UPI ID डालने को कहें।",
  "UPI is switched off for this site until your manager sets a UPI ID. Take cash or card.": "प्रबंधक के UPI ID डालने तक इस स्थल पर UPI बंद है। नकद या कार्ड लें।", "Vehicle": "वाहन", "Vehicles currently parked": "अभी खड़े वाहन", "Waiting to upload": "अपलोड की प्रतीक्षा में",
  "What did you check?": "आपने क्या जाँचा?", "e.g. RC book and driving licence, name matches": "जैसे: RC और ड्राइविंग लाइसेंस, नाम मेल खाता है",
};
