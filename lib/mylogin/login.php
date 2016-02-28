<?php

/*
3 Novembre 2014: move to mysqli
13 Octobre 2014: add user_check()
*/

//error_reporting(E_ALL);
//ini_set('display_errors', 'On');

$rootdir = "/brainbox/";

include $_SERVER['DOCUMENT_ROOT'].$rootdir."/php/base.php";
$connection=mysqli_connect($dbhost,$dbuser,$dbpass,$dblogin) or die("ERROR: Can't connect to MySQL DB: " . mysql_error());

if(isset($_GET["action"]))
{
	switch($_GET["action"])
	{
		case "check":
			user_check();
			break;
		case "login":
			user_login();
			break;
		case "register":
			user_register();
			break;
		case "remind":
			user_remind();
			break;
		case "update":
			user_update();
			break;
		case "logout":
			user_logout();
			break;
	}
}
function user_check()
{
    if($_SESSION['LoggedIn']==1)
        echo '{"response":"Yes", "username":"'.$_SESSION['Username'].'"}';
    else
	    echo '{"response":"No"}';
}
function user_login()
{
    global $connection;
    $username = mysqli_real_escape_string($connection,$_GET['username']);
    $password = md5(mysqli_real_escape_string($connection,$_GET['password']));
    
    $query="SELECT * FROM ".$dblogin.".Users WHERE Username = '".$username."' AND Password = '".$password."'";
    $checklogin = mysqli_query($connection,$query);
    if(mysqli_num_rows($checklogin) == 1)
    {
        $row = mysqli_fetch_array($checklogin);
        $email = $row['EmailAddress'];
        $_SESSION['Username'] = $username;
        $_SESSION['EmailAddress'] = $email;
        $_SESSION['LoggedIn'] = 1;
        echo "Yes";
    }
    else
	    echo "No";
}
function user_register()
{
	global $connection;
	$username = mysqli_real_escape_string($connection,$_GET['username']);
	$password = md5(mysqli_real_escape_string($connection,$_GET['password']));
	$email = mysqli_real_escape_string($connection,$_GET['email']);

	 $checkusername = mysqli_query($connection,"SELECT * FROM ".$dblogin.".Users WHERE Username = '".$username."'");
	 if(mysqli_num_rows($checkusername) == 1)
		echo "Exists";
	 else
	 {
		$registerquery = mysqli_query($connection,"INSERT INTO ".$dblogin.".Users (Username, Password, EmailAddress) VALUES('".$username."', '".$password."', '".$email."')");
		if($registerquery)
		{
			$checklogin = mysqli_query($connection,"SELECT * FROM ".$dblogin.".Users WHERE Username = '".$username."' AND Password = '".$password."'");
			if(mysqli_num_rows($checklogin) == 1)
			{
				$row = mysqli_fetch_array($checklogin);
				$email = $row['EmailAddress'];
				$_SESSION['Username'] = $username;
				$_SESSION['EmailAddress'] = $email;
				$_SESSION['LoggedIn'] = 1;
				echo "Yes";
			}
		}
		else
			echo "Fail";
	 }
}
function user_update()
{
	global $connection;
	
	$message="";
	$success="No";
	if($_SESSION['LoggedIn']==1)
	{
		$username = mysqli_real_escape_string($connection,$_GET['username']);
		$password = md5(mysqli_real_escape_string($connection,$_GET['password']));
		$email = mysqli_real_escape_string($connection,$_GET['email']);

		 $checkusername = mysqli_query($connection,"SELECT * FROM ".$dblogin.".Users WHERE Username = '".$username."' AND Password = '".$password."'");
		 
		 if(mysqli_num_rows($checkusername) == 1)
		 {
			$newpassword = $_GET['newpassword'];
			if(strlen($newpassword)>=8)
			{
				$registerquery=mysqli_query($connection,"UPDATE ".$dblogin.".Users SET Password = '"
					.md5(mysqli_real_escape_string($connection,$newpassword))."' WHERE Username = '".$username."'");
				$message.="Password updated. ";
				$success="Yes";
			}
			
			if($email != $_SESSION['EmailAddress'])
			{
				$registerquery=mysqli_query($connection,"UPDATE ".$dblogin.".Users SET EmailAdress = '".$email."' WHERE Username = '".$username."'");
				$_SESSION['EmailAddress'] = $email;
				$success="Yes";
				$message.="E-Mail address updated";
			}
			
			if($success=="Yes")
				echo '{"success":"Yes","message":"'.$message.'"}';
			else
				echo '{"success":"Yes","message":"No change"}';
		 }
		 else
			echo '{"success":"No","message":"Incorrect password"}';
    }
    else
		echo '{"success":"No","message":"Not logged in"}';
}
function user_remind()
{
	global $connection;
	$flagFound=0;
	
	$email = mysqli_real_escape_string($connection,$_GET['email+name']);
	$checklogin = mysqli_query($connection,"SELECT * FROM ".$dblogin.".Users WHERE EmailAddress = '".$email."'");
	if(mysqli_num_rows($checklogin)==0)
	{
		$username = mysqli_real_escape_string($connection,$_GET['email+name']);
		$checklogin = mysqli_query($connection,"SELECT * FROM ".$dblogin.".Users WHERE Username = '".$username."'");
	}

	if(mysqli_num_rows($checklogin)>0)
	{
		$row = mysqli_fetch_array($checklogin);
		$username = $row['Username'];
		$email = $row['EmailAddress'];
		
		// Generate password
		$length=16;
		$password="";
		$chars = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
		$count = mb_strlen($chars);
		for ($i = 0, $result = ''; $i < $length; $i++) {
			$index = rand(0, $count - 1);
			$password .= mb_substr($chars, $index, 1);
		}
	
		$message = "Dear ".$username.", your new password is: ".$password;
		mail($email,'Password Reset for Brain Catalogue',$message,'From: braincatalogue.org <no-reply@braincatalogue.org>');

		$username = mysqli_real_escape_string($connection,$username);
		$password = md5(mysqli_real_escape_string($connection,$password));
		$email = mysqli_real_escape_string($connection,$email);
		$registerquery=mysqli_query($connection,"UPDATE ".$dblogin.".Users SET Password = '".$password."' WHERE Username = '".$username."' AND EmailAddress = '".$email."'");
		if($registerquery)
			echo "Yes";
		else
			echo "Fail";
	}
	else
	{
		echo "Unavailable";
	}
}

function user_logout()
{
	$_SESSION = array();
	session_destroy();
	echo "Yes";
}
?>
