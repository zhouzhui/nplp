/*
Copyright (c) 2014, dhf
All rights reserved.

Redistribution and use in source and binary forms, with or without modification,
are permitted provided that the following conditions are met:

* Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.

* Redistributions in binary form must reproduce the above copyright notice, this
  list of conditions and the following disclaimer in the documentation and/or
  other materials provided with the distribution.

* Neither the name of the {organization} nor the names of its
  contributors may be used to endorse or promote products derived from
  this software without specific prior written permission.

THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS" AND
ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE IMPLIED
WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE ARE
DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE LIABLE FOR
ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR CONSEQUENTIAL DAMAGES
(INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF SUBSTITUTE GOODS OR SERVICES;
LOSS OF USE, DATA, OR PROFITS; OR BUSINESS INTERRUPTION) HOWEVER CAUSED AND ON
ANY THEORY OF LIABILITY, WHETHER IN CONTRACT, STRICT LIABILITY, OR TORT
(INCLUDING NEGLIGENCE OR OTHERWISE) ARISING IN ANY WAY OUT OF THE USE OF THIS
SOFTWARE, EVEN IF ADVISED OF THE POSSIBILITY OF SUCH DAMAGE.
*/
/**
 * Pushmail long pulling
 * 
 * @param account: required, object
 * <pre>
 * {
 * 	username : $username, // required
 * 	urscookie : $urscookie, // optional
 * 	password : $password //optional(required when urscookie is empty)
 * }
 * </pre>
 * 
 * @param product: optional, string
 */
var Pushmail;
if (!Pushmail) {
	var log = console.log;
	Pushmail = function(account, product) {
		if (!account) {
			throw "account undefined!";
		}
		var username = account.username;
		var password = account.password;
		var urscookie = account.urscookie;
		if (!username) {
			throw "username undefined!";
		}

		if (!password && !urscookie) {
			throw "password and urscookie both undefined!";
		}

		if (!product) {
			product = "webmail";
		}

		var self = this;
		var clientId = undefined;
		var inited = false;
		var stopped = false;
		var pollingXHR = undefined;

		this.init = function() {
			if (password) {
				urscookie = "";
			}

			if (urscookie) {
				inited = true;
				self.onInited(self, username, urscookie);
				return;
			}

			var async = false;
			var onLoginURSSuc = function(username, cookieValue) {
				urscookie = cookieValue;
				inited = true;
				self.onURSAuthSuc(self, username, password, urscookie);
				self.onInited(self, username, urscookie);
			};
			var onLoginURSFail = function(username, retcode) {
				if (undefined == retcode) {
					retcode = "-1";
				}
				self.onURSAuthFail(self, username, password, retcode);
			};
			URS.login(username, password, {
				async : async,
				onSuc : onLoginURSSuc,
				onFail : onLoginURSFail
			});
		};

		/**
		 * get pushmail long pulling host
		 */
		var getHost = function() {
			var hostsMap = {
				"163.com" : "push.mail.163.com",
				"126.com" : "push.mail.126.com",
				"yeah.net" : "push.mail.yeah.net"
			};

			var domain = "163.com";
			var idx = username.indexOf("@");
			if (idx !== -1) {
				domain = username.substr(idx + 1);
			}

			var result = hostsMap[domain];
			if (!result) {
				result = hostsMap["163.com"];
			}
			return result;
		};

		/**
		 * send request to pushmail server
		 * 
		 * @param msg: required, object
		 */
		var sendRequest = function(msg) {
			var caller = sendRequest.caller;

			var host = getHost();
			var url = "http://" + host + "/cometd";

			var message = JSON.stringify(msg);
			log("[DEBUG] message: " + message);

			var xhr = $.ajax({
				url : url,
				data : {
					message : message
				},
				timeout : 120000,
				dataType : "json",
				success : function(data, status, xhr) {
					if (xhr.readyState === 4 && xhr.status === 200) {
						callback(data, caller, msg);
						return;
					}
					callback(undefined, caller, msg);
				},
				error : function(xhr, status, error) {
					callback(undefined, caller, msg);
				}
			});
			return xhr;
		};

		this.stop = function() {
			inited = false;
			stopped = true;
			if (pollingXHR) {
				pollingXHR.abort();
				pollingXHR = undefined;
			}
			clientId = undefined;
		};

		// connect pushmail server, get client id
		this.start = function() {
			if (!inited) {
				return;
			}
			stopped = false;

			var req = {
				channel : "/meta/connect",
				timestamp : new Date().getTime()
			};

			var reqArr = new Array();
			reqArr.push(req);
			sendRequest(reqArr);
		};

		// login pushmail server
		var login = function() {
			if (!clientId) {
				return;
			}

			var req = {
				channel : "/service/push",
				clientId : clientId,
				timestamp : new Date().getTime(),
				data : {
					uid : username,
					auth : urscookie,
					product : product,
					event : "login"
				}
			};

			var reqArr = new Array();
			reqArr.push(req);
			sendRequest(reqArr);
		};

		// polling message from pushmail server, long polling
		var polling = function() {
			if (!clientId) {
				return;
			}

			var req = {
				channel : "/meta/reconnect",
				clientId : clientId,
				timestamp : new Date().getTime()
			};
			var reqArr = new Array();
			reqArr.push(req);
			pollingXHR = sendRequest(reqArr);
		};

		this.onInited = function(self, username, urscookie) {

		};

		/**
		 * invoke when subscribe pushmail success
		 */
		this.onPushAuthSuc = function(self, username, urscookie) {

		};

		this.onPushAuthFail = function(self, username, urscookie) {
			self.stop();
		};

		this.onURSAuthFail = function(self, username, password, ursretcode) {

		};

		this.onURSAuthSuc = function(self, username, password, urscookie) {

		};

		this.onReceiveMail = function(self, username, urscookie, latestMail) {
			log(latestMail);
		};

		var onPollUnrecognizedMsg = function(self, username, urscookie, data) {
			log(data);
		};

		var onPollNoMsg = function() {

		};

		// invoked when error occur
		var onGlobalError = function(data) {
			log("pushmail request fail, return msg: "
					+ JSON.stringify(data));

			if (!data.error) {
				data.error = "unknown error";
			} else {
				data.error = data.error.toLowerCase();
			}

			if ("unknown clientid" === data.error
					|| "exceed max conn" === data.error
					|| "cannot cmd" === data.error) {
				// unknown clientId mostly cause by server reload or user
				// heartbeat timeout;
				// reconnect
				window.setTimeout(function() {
					self.start();
				}, 60000);
			} else if ("auth-failed" === data.error
					|| "auth failed" == data.error) {
				self.onPushAuthFail(self, username, urscookie);
			} else {
				// "unknown channel" / other error
				self.stop();
			}
		};

		// invoked when connected
		var onConnected = function(data) {
			clientId = data.clientId;
			// polling and login
			polling();
			login();
		};

		// invoked when /service/* return
		var onService = function(data) {
			if (!data.successful) {
				onGlobalError(data);
			}
		};

		// invoked when login result return
		var onLoginResult = function(data) {
			self.onPushAuthSuc(self, username, urscookie);
		};

		// invoked when polling return
		var onPollResult = function(data) {
			if (!data.data) {
				// no message available
				onPollNoMsg();
			} else {
				var event = data.data.event;
				if ("login" === event || "push_login" === event
						|| "global_login" === event) {
					onLoginResult(data.data);
				} else if ("pushmail" === event) {
					onPushmail(data.data);
				} else {
					// unknown event, maybe auth failed
					onPollUnrecognizedMsg(self, username, urscookie, data);
				}
			}
		};

		var onPushmail = function(data) {
			if (!data) {
				return;
			}
			var body = data.body;
			var latestMail = {
				to : username,
				from : $.trim(data.from),
				fid : body.folderid,
				mid : body.Mid,
				subject : $.trim(body.Subject),
				content : $.trim(body.Content),
				count : $.trim(body.count),
				senddate : body.SentDate,
				msid : body.MSID,
				id : body.MSID + ":" + body.Mid
			};
			self.onReceiveMail(self, username, urscookie, latestMail);
		};

		/**
		 * callback for all pushmail request
		 * 
		 * @param data, json array or string; message received from pushmail
		 *            server
		 * @param fReqFunc, function; request function
		 * @param fReqMsg, string; request message
		 */
		var callback = function(data, reqFunc, reqMsg) {
			if (typeof (data) !== "object") {
				log("pushmail request fail, return msg: " + data);
				window.setTimeout(reqFunc, 60000);
				return;
			}

			if (!data) { // network error, resend request after 60 second
				log("pushmail request fail, network error");
				window.setTimeout(reqFunc, 60000);
				return;
			} else {
				for ( var i = 0; i < data.length; i++) {
					var message = data[i];
					var channel = message.channel;

					if (!message.successful) {
						onGlobalError(message);
						return;
					}

					if ("/meta/connect" === channel) {
						onConnected(message);
					} else if ("/service/push" === channel) {
						onService(message);
					} else if (("/meta/connections/" + clientId) === channel
							|| "/meta/reconnect" == channel) {
						onPollResult(message);
					} else {
						// unknown channel
						onGlobalError(message);
						return;
					}
				}

				// 判断当前是否是polling的回调， 只有polling的回调才需要继续长连接轮训
				if (reqFunc === polling && !stopped) {
					polling();
				}
			}
		};
	};
}
