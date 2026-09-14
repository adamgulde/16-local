package com.example.demo;

import com.example.demo.config.DatabaseInitializer;
import com.example.demo.model.User;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;

@SpringBootApplication
public class DemoApplication {
    public static void main(String[] args) {
        SpringApplication.run(DemoApplication.class, args);
    }

    public static int getNumberForUser(User u) {
        return DatabaseInitializer.getNumberForUser(u);
    }
}
