/*
6 Octobre 2015: added check for already logged user
*/

var MyLoginWidget = {
	root:"lib/mylogin/",
	username:"",
	loggedin:0,
	verbose:0,
	subscribers:new Array(),
	init: function(MyLogin) {
		var	me=this;
		var def=$.Deferred();
		
		console.log("init MyLogin");
		
		me.MyLogin=MyLogin;
		
		$.get(me.root+"login.html", function(html) {
			me.box=$("<div>").html(html);
		});
		
		$.get(me.root+"login.php",{"action":"check"},function(data){
			try {
				var msg=JSON.parse(data);
			} catch(e) {
				me.displayLoginLink();
				return;
			}
		
			if(msg.response=="Yes")
			{
				me.username=msg.username;
				me.loggedin=1;
				me.displayLoggedinLink();
			}
			else
			{
				me.displayLoginLink();
			}
			if(me.subscribers[0])
				me.subscribers[0](); // inform subscribers of login change
			
			def.resolve();
		});
		
		return def.promise();
	},
	displayWarning: function(msg,elem) {
		var me=this;
		var warning=$("<span>"+msg+"</span>");
		if(elem==undefined)
			me.MyLogin.append(warning);
		else
			elem.append(warning);
		setTimeout(function(){warning.remove();},2000);
	},
	displayLoginLink: function() {
		var me=this;
		me.login=$('<a class="menu">Log In</a>');
		me.MyLogin.html(me.login);
		
		me.login.click(function() {
			me.displayLoginForm();
		});
	},
	displayLoginForm: function() {
		var me=this;
		$("body").append(me.box);
		me.box.find("#username").attr("placeholder","Name or E-Mail");
		me.box.find("#e-mail").html("");
		me.box.find("#password").html("");
		me.box.find("#repassword").html("");
		me.box.find("#username, #password, #sendLogin, #cancel, #registerLink, #remind").show();
		me.box.find("#repassword, #e-mail, #register").hide();
		me.box.addClass("loginbox");
	},
	displayLoggedinLink: function() {
		var me=this;
		if(me.box!=undefined)
			me.box.remove();
		me.user=$('<a class="menu">'+this.username+'</a>');
		//katja, 2016-03-08
		//me.user.attr("href","/user/"+this.username);
		me.logoff=$('<a class="menu">(Log out)</a>');
		me.logoff.click(function() {
			me.logout();
		});
		me.MyLogin.html(me.user);
		me.MyLogin.append(me.logoff);
	},
	displayRegisterForm: function() {
		var me=this;
		me.box.find("#username").attr("placeholder","Name or E-Mail");
		me.box.find("#e-mail").html("");
		me.box.find("#password").html("");
		me.box.find("#repassword").html("");
		me.box.find("#username, #password, #repassword, #e-mail,#register, #cancel, #remind").show();
		me.box.find("#sendLogin,#remind,#registerLink").hide();
	},
	sendLogin: function() {
		var	me=this;
		$.get(me.root+"login.php",{"action":"login","username":me.box.find("#username").val(),"password":me.box.find("#password").val()},function(data){
			console.log("data",data);
			if(data=="Yes")
			{
				me.username=me.box.find("#username").val();
				me.loggedin=1;
				me.displayLoggedinLink();
				if(me.verbose)
					me.displayWarning("Successfully logged in");
				if(me.box!=undefined)
					me.box.remove();
				if(me.subscribers[0])
					me.subscribers[0](); // inform subscribers of login change
			}
			else
			{
				me.loggedin=0;
				me.displayWarning("Incorrect, try again",me.box);
			}
		});
		me.box.find("#password").val("");
	},
	cancel: function() {
		var me=this;
		if(me.box!=undefined)
			me.box.remove();
	},
	logout: function() {
		var me=this;
		$.get(me.root+"login.php",{"action":"logout"},function(data){
			if(data=="Yes")
			{
				me.username="";
				me.loggedin=0;
				me.displayLoginLink();
				if(me.verbose)
					me.displayWarning("Successfully logged out");
				if(me.subscribers[0])
					me.subscribers[0](); // inform subscribers of login change
			}
			else
			{
				me.displayWarning("Unable to logout, try again later");
			}
		});
	},
	sendRegister: function () {
		var	me=this;
		var	reg_username=me.box.find("#username").val();
		var	reg_email=me.box.find("#e-mail").val();
		var	reg_password=me.box.find("#password").val();
		var	reg_repassword=me.box.find("#repassword").val();

		if(reg_username=="" || reg_email=="" || reg_password=="" || reg_repassword=="")
		{
			console.log(reg_username,reg_email,reg_password,reg_repassword);
			me.displayWarning("All fields are required",me.box);
			return;
		}

		if(reg_password!=reg_repassword)
		{
			me.displayWarning("Passwords are not the same",me.box);
			return;
		}

		$.get(me.root+"login.php",{"action":"register","username":reg_username,"email":reg_email,"password":reg_password},function(data){
			if(data=="Yes")
			{
				me.username=reg_username;
				me.loggedin=1;
				me.displayLoggedinLink();
				if(me.verbose)
					me.displayWarning("Successfully registered");
				if(me.subscribers[0])
					me.subscribers[0](); // inform subscribers of login change
			}
			else
			if(data=="Exists")
			{
				me.displayWarning("Username already in use. Try another",me.box);
			}
			else
			{
				me.displayWarning("Unable to register. Please try again later",me.box);
			}
		});
		me.box.find("#password").val("");
		me.box.find("#repassword").val("");
	},
	updateAccount: function(obj) {
		var me=this;
		if(obj.oldpass=="") {
			me.displayWarning("Old password is required to update account information",obj.msg);
			return;
		}

		if(obj.email=="") {
			me.displayWarning("E-mail cannot be empty",obj.msg);
			return;
		}
		
		if(obj.newpass.length>0 && obj.newpass.length<8) {
			me.displayWarning("At least an 8 characters long password",obj.msg);
			return;
		}
		

		$.get(me.root+"login.php",{"action":"update","username":obj.username,"email":obj.email,"password":obj.oldpass,"newpassword":obj.newpass},function(data){

			try {
				data=JSON.parse(data);
				if(data.sucess=="No")
					me.displayWarning("Error: "+data.message,obj.msg);
				else
					me.displayWarning("Success: "+data.message,obj.msg);
			} catch(e) {
				me.displayWarning("Unable to update account. Please try again later",obj.msg);
			}
		});
	},
	remind: function () {
		var	me=this;
		var	reg_username=me.box.find("#username").val();
		var	reg_email=me.box.find("#e-mail").val();
		
		if(!reg_username && !reg_email)
		{
			me.displayWarning("Provide at least a name or an e-mail",me.box);
			return;
		}
		$.get(me.root+"login.php",{"action":"remind","email+name":reg_username},function(data){
			me.box.remove();
			if(data=="Yes")
			{
				me.displayWarning("You should receive shortly a new password by e-mail");
			}
			else
			if(data=="Unavailable")
			{
				me.displayWarning("No account found with that name or e-mail");
			}
			else
			{
				me.displayWarning("Unable to send a new password. Please try again later");
			}
		});
	},
	subscribe: function(sub) {
		var me=this;
		me.subscribers.push(sub);
	},
	unsubscribe: function(sub) {
		var me=this;
		me.subscribers.splice(me.subscribers.indexOf(sub),1);
	}
}

/*
OK	Successfully logged in
OK	Incorrect, try again
OK	Successfully logged out
	Unable to logout, try again later
OK	All fields are required
OK	Passwords are not the same
OK	Successfully registered
OK	Username already in use. Try another
	Unable to register. Please try again later
OK	Provide at least a name or an e-mail
OK	You should receive shortly a new password by e-mail
OK	No account found with that name or e-mail
	Unable to send a new password. Please try again later
	
	
* after registering, the user is automatically loged in. Wouldn't it be preferable to send
the user a password by e-mail to verify that the link exists?
*/